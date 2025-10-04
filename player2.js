/* player2.js — Versión conservadora + auto-unmute
   - Carga playlist.json (con fallback inline)
   - Manejo tolerante HLS (retries suaves)
   - Watchdog para stalls
   - Auto unmute: intenta desmutear al 'playing' y muestra control si falla
   - Exponer window._player_debug para pruebas
*/

(function () {
  // ---------- DOM & Config ----------
  const videoEl = document.getElementById('player-video');
  const playlistListEl = document.getElementById('carouselList');
  const playlistContainerEl = document.getElementById('playlist-container');
  const spinnerEl = document.getElementById('video-loading-spinner');

  // audio panel in HTML (if present). If not, we'll create a minimal one.
  let audioPanel = document.getElementById('audio-panel');
  let audioSelectEl = document.getElementById('audio-select');

  const STATUS_ID = 'player-status';
  let statusEl = document.getElementById(STATUS_ID);
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = STATUS_ID;
    statusEl.className = 'player-status hidden';
    document.body.appendChild(statusEl);
  }

  const CONFIG = {
    playlistUrl: 'playlist.json',
    proxyPrefix: '',       // si usas proxy: 'http://mi-proxy:3000/proxy?url='
    remuxPrefix: '',       // si usas remux server: 'http://mi-proxy:3000/hls/<id>/out.m3u8' (rellenar dinámicamente)
    enablePrewarm: false,  // desactivado por defecto
    maxHlsRetries: 3,
    watchdogInterval: 7000
  };

  // state
  let playlist = [];
  let currentIndex = 0;
  let hlsInst = null;
  let retryCounts = { hlsLevel: 0 };
  let watchdogTimer = null;
  let playLock = false;
  let audioUserMuted = false; // si el usuario pulsó mute explícitamente

  // small helper
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- UI helpers ----------
  function showStatus(msg, ms = 2400) {
    try {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      if (ms) setTimeout(() => statusEl.classList.add('hidden'), ms);
    } catch (e) { console.warn(e); }
  }
  function showPermanentStatus(msg) {
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
  }
  function hideStatus() {
    try { statusEl.classList.add('hidden'); } catch(e) {}
  }

  // ---------- ensure audio panel exists ----------
  function ensureAudioPanel() {
    if (!audioPanel) {
      audioPanel = document.createElement('div');
      audioPanel.id = 'audio-panel';
      audioPanel.className = 'audio-panel hidden';
      audioPanel.style.position = 'absolute';
      audioPanel.style.right = '12px';
      audioPanel.style.top = '56px';
      audioPanel.style.zIndex = 1200;
      audioPanel.style.display = 'flex';
      audioPanel.style.gap = '8px';
      audioPanel.style.alignItems = 'center';
      audioPanel.style.background = 'rgba(0,0,0,0.6)';
      audioPanel.style.padding = '6px 8px';
      audioPanel.style.borderRadius = '8px';
      const icon = document.createElement('i');
      icon.className = 'bi bi-volume-mute-fill';
      icon.style.cursor = 'pointer';
      icon.title = 'Activar audio';
      audioPanel.appendChild(icon);
      audioSelectEl = document.createElement('select');
      audioSelectEl.id = 'audio-select';
      audioPanel.appendChild(audioSelectEl);
      document.body.appendChild(audioPanel);
      // events
      icon.addEventListener('click', () => {
        toggleMute();
      });
    } else {
      // ensure select exists
      if (!audioSelectEl) {
        audioSelectEl = document.createElement('select');
        audioSelectEl.id = 'audio-select';
        audioPanel.appendChild(audioSelectEl);
      }
    }
  }

  ensureAudioPanel();

  // toggle mute state (user-invoked)
  function toggleMute() {
    try {
      audioUserMuted = !audioUserMuted;
      if (videoEl) {
        videoEl.muted = audioUserMuted;
        try { videoEl.volume = audioUserMuted ? 0 : 1; } catch(e){}
      }
      // update icon
      const icon = audioPanel.querySelector('i');
      if (icon) icon.className = audioUserMuted ? 'bi bi-volume-mute-fill' : 'bi bi-volume-up-fill';
      if (!audioUserMuted) {
        showStatus('Audio activado', 1600);
      }
    } catch(e) { console.warn('toggleMute', e); }
  }

  // try to unmute automatically; if blocked, keep panel visible for user action
  async function attemptAutoUnmute() {
    try {
      if (!videoEl) return;
      if (audioUserMuted) return; // respetar elección del usuario

      // set prefered volume and unmute
      try {
        videoEl.muted = false;
        videoEl.volume = 1;
      } catch(e){}

      // try to play to satisfy autoplay policies
      try { await videoEl.play().catch(()=>{}); } catch(e){}

      // if still muted (browser blocked), show control
      if (videoEl.muted) {
        audioPanel.classList.remove('hidden');
        showStatus('Pulsa el botón de audio para activar sonido', 4000);
      } else {
        audioPanel.classList.remove('hidden'); // keep visible for manual track selection
        const icon = audioPanel.querySelector('i'); if (icon) icon.className = 'bi bi-volume-up-fill';
      }
    } catch(e){ console.warn('attemptAutoUnmute', e); }
  }

  // populate audio tracks into audioSelectEl using Hls audioTracks array or videoEl.audioTracks
  function populateAudioTracksFromHls(hlsAudioTracks) {
    try {
      ensureAudioPanel();
      audioSelectEl.innerHTML = '';
      hlsAudioTracks.forEach((t,i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = t.lang || t.name || t.label || `Track ${i+1}`;
        audioSelectEl.appendChild(opt);
      });
      audioSelectEl.onchange = () => {
        const idx = parseInt(audioSelectEl.value);
        try { if (hlsInst && typeof hlsInst.audioTrack !== 'undefined') hlsInst.audioTrack = idx; } catch(e){}
        try {
          if (videoEl && videoEl.audioTracks && videoEl.audioTracks.length) {
            for (let i=0;i<videoEl.audioTracks.length;i++) {
              videoEl.audioTracks[i].enabled = (i === idx);
            }
          }
        } catch(e){}
      };
      audioPanel.classList.remove('hidden');
    } catch(e){ console.warn('populateAudioTracksFromHls', e); }
  }

  // ---------- Playlist loader with inline fallback ----------
  async function loadPlaylist() {
    try {
      const resp = await fetch(CONFIG.playlistUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) throw new Error('playlist.json inválido o vacío');
      playlist = data;
      console.info('[player] playlist cargada desde JSON:', playlist.length);
      return true;
    } catch (err) {
      console.warn('[player] no se pudo cargar playlist.json:', err);
      // fallback inline
      try {
        const inline = document.getElementById('playlist-inline');
        if (inline) {
          const parsed = JSON.parse(inline.textContent || inline.innerText || '[]');
          if (Array.isArray(parsed) && parsed.length) {
            playlist = parsed;
            console.info('[player] playlist cargada desde <script id="playlist-inline">');
            return true;
          }
        }
      } catch(e){}
      return false;
    }
  }

  // ---------- Carousel rendering minimal ----------
  function renderCarousel() {
    playlistListEl.innerHTML = '';
    if (!playlist.length) return;
    const visible = 7;
    const half = Math.floor(visible / 2);
    for (let off=-half; off<=half; off++) {
      const idx = ((currentIndex + off) % playlist.length + playlist.length) % playlist.length;
      const item = createItem(idx);
      playlistListEl.appendChild(item);
    }
    updateCarouselFocus();
  }

  function createItem(idx) {
    const data = playlist[idx] || {};
    const item = document.createElement('div');
    item.className = 'carousel-item';
    item.dataset.idx = idx;
    item.tabIndex = 0;
    item.innerHTML = `
      <div class="item-label"><span>${data.number || ''}</span></div>
      <img src="${data.image || ''}" alt="${data.title || ''}">
      <button class="carousel-button">${data.title || ''}</button>
    `;
    item.addEventListener('click', () => { currentIndex = idx; playCurrent(); });
    return item;
  }

  function updateCarouselFocus() {
    const items = playlistListEl.children;
    const mid = Math.floor(items.length / 2);
    for (let i=0;i<items.length;i++) items[i].classList.toggle('focused', i === mid);
  }

  // ---------- Hls tolerant loader ----------
  function createHls(opts = {}) {
    if (!window.Hls || !Hls.isSupported()) return null;
    const cfg = Object.assign({
      enableWorker: opts.enableWorker !== undefined ? opts.enableWorker : true,
      startFragPrefetch: opts.startFragPrefetch !== undefined ? opts.startFragPrefetch : false,
      maxBufferLength: 60,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 20000,
      levelLoadingTimeOut: 20000,
    }, opts);
    const h = new Hls(cfg);
    // No forzamos withCredentials por defecto; si item.has withCredentials="true" lo aplicaremos en loadWithHls
    h.config.xhrSetup = function(xhr, url) {
      try {
        // set minimal header to help some servers (non-sensitive)
        try { xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); } catch(e){}
      } catch(e){}
    };
    return h;
  }

  function loadWithHls(url, options = {}) {
    return new Promise((resolve, reject) => {
      const h = createHls(options);
      if (!h) return reject(new Error('Hls no disponible'));

      // if need withCredentials per-item
      if (options.withCredentials) {
        h.config.xhrSetup = function(xhr) {
          try { xhr.withCredentials = true; xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
        };
      }

      // cleanup prev
      if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
      hlsInst = h;

      let localRetry = 0;
      const maxLocalRetry = CONFIG.maxHlsRetries;

      function cleanup() {
        try { h.off(Hls.Events.ERROR, onError); } catch(e){}
        try { h.off(Hls.Events.MANIFEST_PARSED, onManifestParsed); } catch(e){}
        try { h.off(Hls.Events.LEVEL_LOADED, onLevelLoaded); } catch(e){}
        try { h.off(Hls.Events.FRAG_LOADED, onFragLoaded); } catch(e){}
      }

      function onError(event, data) {
        console.warn('[Hls error]', data);
        // show short status
        showStatus('HLS: ' + (data && data.details ? data.details : data.type), 2000);

        const details = (data && data.details || '').toLowerCase();

        // For network/level/frag errors, attempt local retry a few times
        if (details.includes('level') || details.includes('frag') || details.includes('manifest') || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          localRetry++;
          if (localRetry <= maxLocalRetry) {
            try { if (h && h.startLoad) h.startLoad(); } catch(e){}
            return; // allow more attempts
          } else {
            cleanup();
            try { h.destroy(); } catch(e){}
            hlsInst = null;
            return reject(new Error('Hls failed after local retries: ' + (data.details || data.type)));
          }
        }

        if (data && data.fatal) {
          cleanup();
          try { h.destroy(); } catch(e){}
          hlsInst = null;
          return reject(new Error('Hls fatal: ' + (data.details || data.type)));
        }
      }

      function onManifestParsed() {
        // do nothing special here (we wait for level/frag)
      }
      function onLevelLoaded() {
        cleanup();
        try { videoEl.play().catch(()=>{}); } catch(e){}
        resolve();
      }
      function onFragLoaded() {
        cleanup();
        try { videoEl.play().catch(()=>{}); } catch(e){}
        resolve();
      }

      h.on(Hls.Events.ERROR, onError);
      h.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
      h.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
      h.on(Hls.Events.FRAG_LOADED, onFragLoaded);
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        try { if (h.audioTracks && h.audioTracks.length > 1) populateAudioTracksFromHls(h.audioTracks); } catch(e){}
      });

      try {
        h.loadSource(url);
        h.attachMedia(videoEl);
        try { if (h.startLoad) h.startLoad(0); } catch(e){}
      } catch(e) {
        cleanup();
        try { h.destroy(); } catch(err){}
        hlsInst = null;
        return reject(e);
      }
    });
  }

  // ---------- play sequence ----------
  async function playCurrent() {
    if (playLock) return;
    playLock = true;
    const item = playlist[currentIndex];
    if (!item) { playLock = false; return; }

    const url = (item.file || '').trim();
    if (!url) { showStatus('URL inválida'); playLock = false; return; }

    // reset counters
    retryCounts.hlsLevel = 0;

    spinnerEl && spinnerEl.classList.remove('hidden');
    showStatus('Intentando: ' + url, 2000);

    // clean video element
    try { videoEl.pause(); } catch(e){}
    try { videoEl.removeAttribute('src'); videoEl.load(); } catch(e){}
    await sleep(180);

    // attempt list: HLS worker true -> worker false -> manifest->blob -> native -> proxy/remux fallback
    const attempts = [
      { label: 'HLS (worker:true)', fn: () => loadWithHls(url, { enableWorker:true, withCredentials: !!item.withCredentials }) },
      { label: 'HLS (worker:false)', fn: () => loadWithHls(url, { enableWorker:false, withCredentials: !!item.withCredentials }) },
      { label: 'manifest->blob -> HLS', fn: async () => {
          // fetch manifest, convert relative URIs to absolute, create blob
          const resp = await fetch(url, { cache: 'no-store' });
          if (!resp.ok) throw new Error('manifest fetch ' + resp.status);
          const txt = await resp.text();
          const base = url.replace(/\/[^\/]*$/, '/');
          const lines = txt.split(/\r?\n/).map(l => {
            if (l && l[0] !== '#') {
              if (!/^https?:\/\//i.test(l)) return base + l;
            }
            return l;
          }).join('\n');
          const blobUrl = URL.createObjectURL(new Blob([lines], { type: 'application/vnd.apple.mpegurl' }));
          try {
            await loadWithHls(blobUrl, { enableWorker:false, withCredentials: !!item.withCredentials });
            URL.revokeObjectURL(blobUrl);
          } catch(e) {
            try { URL.revokeObjectURL(blobUrl); } catch(_){}
            throw e;
          }
        }
      },
      { label: 'Native fallback', fn: async () => {
          try { videoEl.src = url; videoEl.load(); await videoEl.play().catch(()=>{}); } catch(e){}
        }
      }
    ];

    // proxy/remux fallback if configured
    if (CONFIG.proxyPrefix) {
      attempts.push({ label: 'Proxy passthrough', fn: () => loadWithHls(CONFIG.proxyPrefix + encodeURIComponent(url), { enableWorker:false }) });
    }
    if (CONFIG.remuxPrefix) {
      attempts.push({ label: 'Remux (server)', fn: async () => {
        // request remux endpoint to create remux job
        // The server should expose an API like /remux?url=<encoded> that responds with /hls/<id>/out.m3u8
        try {
          const remuxApi = CONFIG.remuxPrefix + encodeURIComponent(url); // ex: http://server:3000/remux?url=
          const resp = await fetch(remuxApi, { cache:'no-store' });
          if (!resp.ok) throw new Error('remux API ' + resp.status);
          const body = await resp.json();
          if (!body || !body.playlist) throw new Error('remux response invalid');
          const remuxed = body.playlist; // e.g. http://server:3000/hls/<id>/out.m3u8
          await loadWithHls(remuxed, { enableWorker:false });
        } catch(e) { throw e; }
      }});
    }

    let ok = false;
    for (const a of attempts) {
      try {
        showStatus(a.label, 1800);
        await a.fn();
        ok = true;
        hideStatus();
        spinnerEl && spinnerEl.classList.add('hidden');
        // success: try to auto-unmute
        await attemptAutoUnmute();
        startWatchdog();
        break;
      } catch (err) {
        console.warn('[player] attempt failed:', a.label, err);
        await sleep(300);
      }
    }

    if (!ok) {
      spinnerEl && spinnerEl.classList.add('hidden');
      showPermanentStatus('No se pudo reproducir. Si el problema persiste, prueba con proxy/remux.');
    }

    playLock = false;
  }

  // ---------- watchdog ----------
  function startWatchdog() {
    stopWatchdog();
    let last = videoEl.currentTime;
    watchdogTimer = setInterval(async () => {
      try {
        if (!videoEl.paused && !videoEl.ended) {
          const now = videoEl.currentTime;
          if (Math.abs(now - last) < 0.02) {
            console.warn('[watchdog] stall detected, trying gentle recovery');
            stopWatchdog();
            if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
            await sleep(300);
            // try quick HLS reload worker=false
            try {
              const item = playlist[currentIndex];
              if (item) await loadWithHls(item.file, { enableWorker:false, withCredentials: !!item.withCredentials });
              spinnerEl && spinnerEl.classList.add('hidden');
              startWatchdog();
              return;
            } catch(e) {
              console.warn('[watchdog] recovery failed', e);
            }
          } else last = now;
        } else last = videoEl.currentTime;
      } catch(e){}
    }, CONFIG.watchdogInterval);
  }
  function stopWatchdog() {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  }

  // ---------- UI bindings minimal ----------
  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','Enter',' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp') { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; renderCarousel(); }
    else if (e.key === 'ArrowDown') { currentIndex = (currentIndex + 1) % playlist.length; renderCarousel(); }
    else if (e.key === 'Enter' || e.key === ' ') { playCurrent(); }
  });

  // spinner/hls events: ensure attemptAutoUnmute called on playing
  videoEl.addEventListener('playing', () => {
    try { spinnerEl && spinnerEl.classList.add('hidden'); } catch(e){}
    // try auto-unmute
    attemptAutoUnmute().catch(()=>{});
  });
  videoEl.addEventListener('waiting', () => { try { spinnerEl && spinnerEl.classList.remove('hidden'); } catch(e){} });
  videoEl.addEventListener('error', () => {
    console.warn('[video] element error, reloading channel');
    playCurrent();
  });

  // ---------- bootstrap ----------
  (async function bootstrap() {
    const ok = await loadPlaylist();
    if (!ok) {
      showPermanentStatus('No se pudo cargar playlist.json ni playlist-inline.');
      return;
    }
    renderCarousel();
    // play first after short delay
    setTimeout(() => { playCurrent().catch(e => console.warn('playCurrent initial error', e)); }, 300);
  })();

  // debug helpers
  window._player_debug = {
    playIndex: i => { currentIndex = i; renderCarousel(); playCurrent(); },
    playlist,
    setProxy: p => CONFIG.proxyPrefix = p,
    setRemuxApi: r => CONFIG.remuxPrefix = r,
    toggleMute: () => toggleMute(),
    statusEl
  };

})();
