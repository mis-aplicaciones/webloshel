/* player2.js — Versión robusta (corrige audio, stalls, scroll mobile)
   - Safe HLS lifecycle (detachMedia / stopLoad / destroy)
   - playSessionId para evitar races
   - Auto-unmute + control manual confiable
   - Touch handlers NO intrusivos en mobile (scroll nativo)
   - Mínimos intentos y rápido fallback
*/

(function () {
  // ---------- DOM ----------
  const videoEl = document.getElementById('player-video');
  const playlistEl = document.getElementById('carouselList');
  const playlistContainer = document.getElementById('playlist-container');
  const spinnerEl = document.getElementById('video-loading-spinner');
  const statusEl = document.getElementById('player-status') || (() => {
    const d = document.createElement('div'); d.id = 'player-status'; d.className='player-status hidden'; document.body.appendChild(d); return d;
  })();

  // audio panel (if exists in markup)
  let audioPanel = document.getElementById('audio-panel');
  let audioSelect = document.getElementById('audio-select');
  if (!audioPanel) {
    // ensure minimal UI so user can toggle audio if not present in HTML
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
    const icon = document.createElement('i'); icon.className = 'bi bi-volume-mute-fill'; icon.style.cursor = 'pointer';
    audioPanel.appendChild(icon);
    audioSelect = document.createElement('select'); audioSelect.id = 'audio-select';
    audioPanel.appendChild(audioSelect);
    document.body.appendChild(audioPanel);
    icon.addEventListener('click', () => toggleMute(true));
  } else {
    audioSelect = audioSelect || (() => {
      const s = document.createElement('select'); s.id = 'audio-select'; audioPanel.appendChild(s); return s;
    })();
    // if audioPanel exists and has icon, attach click
    const icon = audioPanel.querySelector('i');
    if (icon) icon.addEventListener('click', () => toggleMute(true));
  }

  // ---------- Config ----------
  const CONFIG = {
    playlistUrl: 'playlist.json',
    proxyPrefix: '',       // set this if you have proxy
    remuxApiPrefix: '',    // set this if using remux server
    maxLocalHlsRetries: 2,
    watchdogInterval: 7000
  };

  // ---------- State ----------
  let playlist = [];
  let currentIndex = 0;
  let hlsInst = null;
  let playLock = false;
  let watchdogTimer = null;
  let userMuted = false; // user toggled mute
  let playSessionId = 0; // incremental token for each playCurrent run

  // mobile detection (for scroll / touch behavior)
  const isMobile = (() => {
    try {
      return window.matchMedia && window.matchMedia('(max-width:768px)').matches;
    } catch(e) {
      return ('ontouchstart' in window) && window.innerWidth <= 1024;
    }
  })();

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- UI helpers ----------
  function showStatus(msg, ms = 2400) {
    try {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      if (ms) setTimeout(() => statusEl.classList.add('hidden'), ms);
    } catch(e) {}
  }
  function showPermanent(msg) {
    try { statusEl.textContent = msg; statusEl.classList.remove('hidden'); } catch(e){}
  }
  function hideStatus() { try { statusEl.classList.add('hidden'); } catch(e){} }

  // ---------- Mute / Unmute controls ----------
  function toggleMute(userGesture = false) {
    try {
      // toggle state
      userMuted = !userMuted;
      videoEl.muted = userMuted;
      try { videoEl.volume = userMuted ? 0 : 1; } catch(e){}
      const icon = audioPanel.querySelector('i');
      if (icon) icon.className = userMuted ? 'bi bi-volume-mute-fill' : 'bi bi-volume-up-fill';
      if (!userMuted && userGesture) {
        // restore audio and attempt to play to activate audio pipeline
        try { videoEl.play().catch(()=>{}); } catch(e){}
        showStatus('Audio activado', 1200);
      } else if (userGesture) {
        showStatus('Silenciado', 1200);
      }
    } catch(e) { console.warn('toggleMute err', e); }
  }

  // attempt to auto-unmute after real playback begins; returns true if succeeded (audio allowed)
  async function attemptAutoUnmuteThisSession(sessId) {
    try {
      if (userMuted) return false; // respect user explicit mute
      // Try unmuting and playing — if blocked, browser will keep it (or throw)
      try {
        videoEl.muted = false;
        videoEl.volume = 1;
        await videoEl.play().catch(()=>{});
      } catch(e) {
        // silent catch
      }
      // Make sure the session didn't change while we awaited
      if (sessId !== playSessionId) return false;
      // If still muted or zero volume, we failed to unmute automatically
      if (videoEl.muted || (typeof videoEl.volume === 'number' && videoEl.volume === 0)) {
        audioPanel.classList.remove('hidden'); // show manual control
        const icon = audioPanel.querySelector('i'); if (icon) icon.className = 'bi bi-volume-mute-fill';
        showStatus('Pulsa el icono de audio para activar sonido', 3500);
        return false;
      }
      // success
      audioPanel.classList.remove('hidden');
      const icon = audioPanel.querySelector('i'); if (icon) icon.className = 'bi bi-volume-up-fill';
      return true;
    } catch(e) {
      console.warn('attemptAutoUnmuteThisSession', e);
      return false;
    }
  }

  function populateAudioTracksFromHls(hlsAudioTracks) {
    try {
      if (!audioSelect) return;
      audioSelect.innerHTML = '';
      hlsAudioTracks.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = t.lang || t.name || t.label || `Track ${i+1}`;
        audioSelect.appendChild(opt);
      });
      audioSelect.onchange = () => {
        const idx = parseInt(audioSelect.value);
        try { if (hlsInst && typeof hlsInst.audioTrack !== 'undefined') hlsInst.audioTrack = idx; } catch(e){}
        try {
          if (videoEl && videoEl.audioTracks && videoEl.audioTracks.length) {
            for (let i=0;i<videoEl.audioTracks.length;i++) videoEl.audioTracks[i].enabled = (i === idx);
          }
        } catch(e){}
        // also ensure audio is unmuted if user tries to select track
        userMuted = false; videoEl.muted = false; try{videoEl.volume = 1;}catch(e){}
        try { videoEl.play().catch(()=>{}); } catch(e){}
      };
      audioPanel.classList.remove('hidden');
      const icon = audioPanel.querySelector('i'); if (icon) icon.className = 'bi bi-volume-up-fill';
    } catch(e) { console.warn('populateAudioTracksFromHls', e); }
  }

  // ---------- Playlist loading (json with inline fallback) ----------
  async function loadPlaylist() {
    try {
      const resp = await fetch(CONFIG.playlistUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) throw new Error('playlist.json inválido o vacío');
      playlist = data;
      console.info('[player] playlist loaded (json):', playlist.length);
      return true;
    } catch(err) {
      console.warn('[player] playlist.json load failed:', err);
      // fallback to inline
      try {
        const inline = document.getElementById('playlist-inline');
        if (inline) {
          const parsed = JSON.parse(inline.textContent || inline.innerText || '[]');
          if (Array.isArray(parsed) && parsed.length) {
            playlist = parsed;
            console.info('[player] playlist loaded (inline fallback)');
            return true;
          }
        }
      } catch(e) {}
      return false;
    }
  }

  // ---------- Render carousel (minimal, non-blocking) ----------
  function renderCarousel() {
    playlistEl.innerHTML = '';
    if (!playlist.length) return;
    const visible = 7; const half = Math.floor(visible/2);
    for (let off = -half; off <= half; off++) {
      const idx = ((currentIndex + off) % playlist.length + playlist.length) % playlist.length;
      const it = playlist[idx] || {};
      const item = document.createElement('div');
      item.className = 'carousel-item';
      item.dataset.idx = idx;
      item.tabIndex = 0;
      item.innerHTML = `<div class="item-label"><span>${it.number||''}</span></div><img src="${it.image||''}" alt="${it.title||''}"><button class="carousel-button">${it.title||''}</button>`;
      item.addEventListener('click', () => { currentIndex = idx; playCurrent(); });
      playlistEl.appendChild(item);
    }
    // focus style
    const kids = playlistEl.children;
    const mid = Math.floor(kids.length/2);
    for (let i=0;i<kids.length;i++) kids[i].classList.toggle('focused', i===mid);
  }

  // ---------- Hls create/load with safe lifecycle ----------
  function createHls(cfg = {}) {
    if (!window.Hls || !Hls.isSupported()) return null;
    const base = Object.assign({
      enableWorker: cfg.enableWorker !== undefined ? cfg.enableWorker : false,
      startFragPrefetch: cfg.startFragPrefetch !== undefined ? cfg.startFragPrefetch : false,
      maxBufferLength: 60,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 20000,
      levelLoadingTimeOut: 20000
    }, cfg);
    const h = new Hls(base);
    h.config.xhrSetup = function(xhr) {
      try { xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
    };
    return h;
  }

  function safeDestroyHls() {
    try {
      if (hlsInst) {
        try { hlsInst.stopLoad && hlsInst.stopLoad(); } catch(e){}
        try { hlsInst.detachMedia && hlsInst.detachMedia(); } catch(e){}
        try { hlsInst.destroy && hlsInst.destroy(); } catch(e){}
      }
    } catch(e) { console.warn('safeDestroyHls', e); }
    hlsInst = null;
  }

  // load with Hls and resolve when fragment or level loaded
  function loadWithHls(url, options = {}) {
    return new Promise((resolve, reject) => {
      const h = createHls(options);
      if (!h) return reject(new Error('Hls not available'));

      // per-item withCredentials if requested
      if (options.withCredentials) {
        h.config.xhrSetup = function(xhr) {
          try { xhr.withCredentials = true; xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
        };
      }

      // cleanup previous
      safeDestroyHls();
      hlsInst = h;

      let localRetry = 0;
      const maxLocal = CONFIG.maxLocalHlsRetries;

      const onError = (ev, data) => {
        console.warn('[Hls error]', data);
        showStatus('HLS: ' + (data && data.details ? data.details : data.type), 1600);
        const details = (data && data.details || '').toLowerCase();
        if (details.includes('level') || details.includes('frag') || details.includes('manifest') || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          localRetry++;
          if (localRetry <= maxLocal) {
            try { h.startLoad && h.startLoad(); } catch(e){}
            return;
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
      };

      const onManifestParsed = () => { /* wait for level/frag */ };
      const onLevelLoaded = () => { cleanup(); try { videoEl.play().catch(()=>{}); } catch(e){} resolve(); };
      const onFragLoaded = () => { cleanup(); try { videoEl.play().catch(()=>{}); } catch(e){} resolve(); };

      const onAudioTracksUpdated = () => {
        try { if (h.audioTracks && h.audioTracks.length > 1) populateAudioTracksFromHls(h.audioTracks); } catch(e){}
      };

      const cleanup = () => {
        try { h.off(Hls.Events.ERROR, onError); } catch(e){}
        try { h.off(Hls.Events.MANIFEST_PARSED, onManifestParsed); } catch(e){}
        try { h.off(Hls.Events.LEVEL_LOADED, onLevelLoaded); } catch(e){}
        try { h.off(Hls.Events.FRAG_LOADED, onFragLoaded); } catch(e){}
        try { h.off(Hls.Events.AUDIO_TRACKS_UPDATED, onAudioTracksUpdated); } catch(e){}
      };

      h.on(Hls.Events.ERROR, onError);
      h.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
      h.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
      h.on(Hls.Events.FRAG_LOADED, onFragLoaded);
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, onAudioTracksUpdated);

      try {
        h.loadSource(url);
        h.attachMedia(videoEl);
        try { h.startLoad && h.startLoad(0); } catch(e){}
      } catch(e) {
        cleanup();
        try { h.destroy(); } catch(err){}
        hlsInst = null;
        return reject(e);
      }
    });
  }

  // ---------- play logic with session token ----------
  async function playCurrent() {
    if (playLock) return;
    playLock = true;
    const session = ++playSessionId; // current session token

    const item = playlist[currentIndex];
    if (!item) { playLock = false; return; }
    const url = (item.file || '').trim();
    if (!url) { showStatus('URL inválida', 2000); playLock = false; return; }

    // stop watchdog and safely destroy previous resources
    stopWatchdog();
    safeDestroyHls();

    // clean video element thoroughly
    try {
      videoEl.pause();
    } catch(e) {}
    try {
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch(e) {}
    await sleep(160);

    // spinner
    spinnerEl && spinnerEl.classList.remove('hidden');
    showStatus('Cargando ' + url, 1400);

    // quick ordered attempts (fast)
    const attempts = [
      { label: 'HLS (worker:false)', fn: () => loadWithHls(url, { enableWorker:false, startFragPrefetch:false, withCredentials: !!item.withCredentials }) },
      { label: 'HLS (worker:true)', fn: () => loadWithHls(url, { enableWorker:true, startFragPrefetch:false, withCredentials: !!item.withCredentials }) },
      { label: 'Fallback nativo', fn: async () => { try { videoEl.src = url; videoEl.load(); await videoEl.play().catch(()=>{}); } catch(e){} } }
    ];

    // optionally proxy/remux if configured (not added by default)
    if (CONFIG.proxyPrefix) attempts.push({ label: 'Proxy passthrough', fn: () => loadWithHls(CONFIG.proxyPrefix + encodeURIComponent(url), { enableWorker:false }) });
    if (CONFIG.remuxApiPrefix) attempts.push({ label: 'Remux server', fn: async () => {
      const api = CONFIG.remuxApiPrefix + encodeURIComponent(url);
      const resp = await fetch(api, { cache:'no-store' });
      if (!resp.ok) throw new Error('remux api ' + resp.status);
      const body = await resp.json();
      if (!body || !body.playlist) throw new Error('remux invalid');
      await loadWithHls(body.playlist, { enableWorker:false });
    }});

    let ok = false;
    for (const a of attempts) {
      // if session changed, abort the loop
      if (session !== playSessionId) break;
      try {
        showStatus(a.label, 1200);
        await a.fn();
        // ensure session still the same
        if (session !== playSessionId) break;
        ok = true;
        hideStatus();
        spinnerEl && spinnerEl.classList.add('hidden');
        // after successful load, try auto-unmute in this session
        await attemptAutoUnmuteThisSession(session);
        startWatchdog();
        break;
      } catch (err) {
        console.warn('[player] attempt failed', a.label, err);
        // small backoff
        await sleep(240);
      }
    }

    if (!ok && session === playSessionId) {
      spinnerEl && spinnerEl.classList.add('hidden');
      showPermanent('No se pudo reproducir. Prueba proxy/remux si sigue fallando.');
    }

    playLock = false;
  }

  // ---------- watchdog: detect stalls ----------
  function startWatchdog() {
    stopWatchdog();
    let last = videoEl.currentTime;
    watchdogTimer = setInterval(async () => {
      try {
        if (!videoEl.paused && !videoEl.ended) {
          const now = videoEl.currentTime;
          if (Math.abs(now - last) < 0.02) {
            console.warn('[watchdog] stall detected — attempting gentle recovery');
            // gentle recovery: destroy Hls and try quick reconnect
            stopWatchdog();
            const session = ++playSessionId;
            safeDestroyHls();
            // wait a bit and attempt quick HLS reload worker=false
            await sleep(300);
            try {
              const item = playlist[currentIndex];
              if (item && session === playSessionId) {
                await loadWithHls(item.file, { enableWorker:false });
                spinnerEl && spinnerEl.classList.add('hidden');
                startWatchdog();
                return;
              }
            } catch(e) {
              console.warn('[watchdog] recovery failed', e);
            }
            // if recovery fails we let it be; user can change channel
          } else last = now;
        } else last = videoEl.currentTime;
      } catch(e) {}
    }, CONFIG.watchdogInterval);
  }
  function stopWatchdog() { if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; } }

  // ---------- Touch handlers: only on non-mobile devices (so mobile uses native scroll) ----------
  function initTouchHandlers() {
    const wrapper = playlistContainer.querySelector('.carousel-wrapper');
    if (!wrapper) return;
    if (isMobile) {
      // on mobile allow native scroll
      playlistContainer.style.overflowY = 'auto';
      // remove any wheel/touch preventDefault global handlers if present — we won't add any here
      return;
    }
    // For TV / non-mobile attach carousel touch handlers (optional)
    let startY = 0, dragging = false, itemH = 0, baseY = 0;
    const listEl = playlistEl;
    const recalc = () => {
      const first = listEl.children[0];
      if (!first) return;
      const st = getComputedStyle(first);
      itemH = first.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
      const wrapH = wrapper.clientHeight;
      baseY = wrapH/2 - itemH/2 - Math.floor(7/2) * itemH;
    };
    wrapper.addEventListener('touchstart', e => {
      recalc();
      startY = e.touches[0].clientY;
      dragging = true;
      listEl.style.transition = 'none';
    }, { passive: true });
    wrapper.addEventListener('touchmove', e => {
      if (!dragging) return;
      const delta = e.touches[0].clientY - startY;
      listEl.style.transform = `translateY(${baseY + delta}px)`;
    }, { passive: true });
    wrapper.addEventListener('touchend', e => {
      if (!dragging) return;
      dragging = false;
      const delta = e.changedTouches[0].clientY - startY;
      const steps = Math.round(-delta / (itemH || 120));
      currentIndex = ((currentIndex + steps) % playlist.length + playlist.length) % playlist.length;
      renderCarousel();
      listEl.style.transition = 'transform .3s ease';
      listEl.style.transform = '';
    }, { passive: true });
  }

  // ---------- Event bindings ----------
  videoEl.addEventListener('playing', () => {
    try { spinnerEl && spinnerEl.classList.add('hidden'); } catch(e) {}
    // attempt to auto-unmute under current session (safe)
    attemptAutoUnmuteThisSession(playSessionId).catch(()=>{});
  });
  videoEl.addEventListener('waiting', () => { try { spinnerEl && spinnerEl.classList.remove('hidden'); } catch(e){} });
  videoEl.addEventListener('error', () => {
    console.warn('[video] element error — reload current channel');
    // try to reload current channel (but in a new session)
    playCurrent().catch(()=>{});
  });

  window.addEventListener('keydown', (e) => {
    // basic dpad nav
    if (['ArrowUp','ArrowDown','Enter',' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp') { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; renderCarousel(); }
    else if (e.key === 'ArrowDown') { currentIndex = (currentIndex + 1) % playlist.length; renderCarousel(); }
    else if (e.key === 'Enter' || e.key === ' ') { playCurrent(); }
  }, false);

  // prevent touch/wheel interception that breaks mobile scrolling: we do NOT add global preventDefault

  // ---------- Bootstrap ----------
  (async function bootstrap() {
    const ok = await (async () => { try { return await loadPlaylist(); } catch(e){ return false; } })();
    if (!ok) {
      showPermanent('Error al cargar playlist.json. Revisa ruta o usa playlist inline');
      return;
    }
    renderCarousel();
    initTouchHandlers();
    // autoplay first after a short tick
    setTimeout(() => { playCurrent().catch(e=>console.warn('initial play error', e)); }, 300);
  })();

  // debug helpers
  window._player_debug = {
    playlist,
    playIndex: i => { currentIndex = i; renderCarousel(); playCurrent(); },
    setProxy: p => CONFIG.proxyPrefix = p,
    setRemuxApi: r => CONFIG.remuxApiPrefix = r,
    toggleMute: () => toggleMute(true),
    statusEl
  };

})();
