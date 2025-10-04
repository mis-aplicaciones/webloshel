/* player2.js — Versión reparada y conservadora para evitar bloqueos al cargar playlist.json
   Objetivos:
   - No forzar withCredentials por defecto (reduce errores CORS).
   - Evitar prewarm agresivo (opcional).
   - Manejo más tolerante de level/frag/manifest errors con reintentos.
   - Fallback a playlist inline si playlist.json falla.
   - Panel diagnóstico para ver URL / errores en pantalla.
*/

(function () {
  // ---------------- DOM ----------------
  const videoEl = document.getElementById('player-video');
  const playlistListEl = document.getElementById('carouselList');
  const playlistContainerEl = document.getElementById('playlist-container');
  const spinnerEl = document.getElementById('video-loading-spinner');
  const statusEl = document.getElementById('player-status') || (() => {
    const d = document.createElement('div'); d.id='player-status'; d.className='player-status hidden'; document.body.appendChild(d); return d;
  })();

  // config
  const CONFIG = {
    playlistUrl: 'playlist.json',
    proxyPrefix: '',         // si usas proxy: 'http://mi-proxy:3000/proxy?url='
    enablePrewarm: false,    // DESACTIVADO por defecto (activa solo si confirmas que ayuda)
    maxHlsRetries: 3,        // reintentos por error de nivel/frag antes de cambiar estrategia
    watchdogInterval: 7000,
  };

  // state
  let playlist = [];
  let currentIndex = 0;
  let hlsInst = null;
  let retryCounts = { hlsLevel: 0 };
  let watchdogTimer = null;
  let playLock = false; // evita múltiples llamadas simultáneas a playCurrent

  // helpers UI
  function showStatus(msg, ms = 2500) {
    try {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      if (ms) setTimeout(() => statusEl.classList.add('hidden'), ms);
    } catch(e){}
  }

  function showPermanentStatus(msg) {
    try {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
    } catch(e){}
  }

  function hideStatus() { try { statusEl.classList.add('hidden'); } catch(e){} }

  // helper sleep
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- Playlist loader: fetch JSON, fallback inline <script id="playlist-inline"> ----------
  async function loadPlaylistFromServer() {
    try {
      const resp = await fetch(CONFIG.playlistUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) throw new Error('playlist.json inválido o vacío');
      playlist = data;
      console.info('[player] playlist cargada desde JSON:', playlist.length, 'items');
      return true;
    } catch (err) {
      console.warn('[player] no se pudo cargar playlist.json:', err);
      // fallback: buscar un script inline con id playlist-inline
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

  // ---------- Render carousel (simple) ----------
  function renderCarousel() {
    playlistListEl.innerHTML = '';
    if (!playlist.length) return;
    const visibleCount = 7;
    const half = Math.floor(visibleCount/2);
    for (let off = -half; off <= half; off++) {
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
    item.tabIndex = 0;
    item.dataset.idx = idx;
    item.innerHTML = `
      <div class="item-label"><span>${data.number || ''}</span></div>
      <img src="${data.image || ''}" alt="${(data.title||'')}">
      <button class="carousel-button">${data.title||''}</button>
    `;
    item.addEventListener('click', () => {
      currentIndex = idx;
      playCurrent();
    });
    return item;
  }

  function updateCarouselFocus() {
    const items = playlistListEl.children;
    const halfIdx = Math.floor(items.length/2);
    for (let i=0;i<items.length;i++){
      items[i].classList.toggle('focused', i === halfIdx);
    }
  }

  // ---------- HLS handling with tolerant error behavior ----------
  function createHlsInstance(opts = {}) {
    if (!window.Hls || !Hls.isSupported()) return null;
    const baseCfg = {
      enableWorker: opts.enableWorker !== undefined ? opts.enableWorker : true,
      startFragPrefetch: opts.startFragPrefetch !== undefined ? opts.startFragPrefetch : false,
      maxBufferLength: 60,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 20000,
      levelLoadingTimeOut: 20000,
    };
    const h = new Hls(baseCfg);

    // *Important*: NO forzamos withCredentials por defecto; algunos servidores fallan si se envían credenciales.
    // Si necesitas cookies / auth, añade en el playlist item -> withCredentials: true y lo usaremos.
    h.config.xhrSetup = function(xhr, url) {
      try {
        // Nota: no seteamos xhr.withCredentials = true aquí por defecto.
        // Si el item indica lo contrario, lo pondremos al iniciar la carga.
        xhr.setRequestHeader && (() => {
          try { xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
        })();
      } catch(e){}
    };

    return h;
  }

  // Attach Hls and wait until a level or frag loads (but with retries)
  function loadWithHls(url, options = {}) {
    return new Promise((resolve, reject) => {
      const h = createHlsInstance(options);
      if (!h) return reject(new Error('Hls no disponible'));

      // apply withCredentials per-item (options.withCredentials)
      if (options.withCredentials) {
        h.config.xhrSetup = function(xhr, url) {
          try { xhr.withCredentials = true; xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
        };
      }

      // cleanup prev hls
      if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
      hlsInst = h;

      let fatalDetected = false;

      function cleanupHandlers() {
        try { h.off(Hls.Events.ERROR, onError); } catch(e){}
        try { h.off(Hls.Events.MANIFEST_PARSED, onManifest); } catch(e){}
        try { h.off(Hls.Events.LEVEL_LOADED, onLevelLoaded); } catch(e){}
        try { h.off(Hls.Events.FRAG_LOADED, onFragLoaded); } catch(e){}
      }

      function onError(event, data) {
        console.warn('[Hls error]', data);
        // track last error message for diagnostics
        showStatus('Hls error: ' + (data && data.details ? data.details : data.type), 3000);

        // network/manifest/level/frag errors: attempt local recovery a few times
        const details = (data && data.details || '').toLowerCase();
        if (details.includes('level') || details.includes('frag') || details.includes('manifest') || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // increment retryCounts.hlsLevel
          retryCounts.hlsLevel = (retryCounts.hlsLevel || 0) + 1;
          if (retryCounts.hlsLevel <= CONFIG.maxHlsRetries) {
            // short recovery: try restarting load
            try { h.startLoad && h.startLoad(); } catch(e){ console.warn('startLoad failed', e); }
            return; // allow more attempts
          } else {
            // exceeded local retries: fail to trigger next strategy
            cleanupHandlers();
            try { h.destroy(); } catch(e){}
            hlsInst = null;
            return reject(new Error('Hls fatal after retries: ' + (data.details||data.type)));
          }
        }

        if (data && data.fatal) {
          cleanupHandlers();
          try { h.destroy(); } catch(e){}
          hlsInst = null;
          return reject(new Error('Hls fatal: ' + (data.details || data.type)));
        }
      }

      function onManifest() {
        // when manifest parsed we wait for level or frag events to be safe
        // nothing to do here other than maybe update audio tracks
      }

      function onLevelLoaded() {
        cleanupHandlers();
        try { videoEl.play().catch(()=>{}); } catch(e){}
        return resolve();
      }

      function onFragLoaded() {
        cleanupHandlers();
        try { videoEl.play().catch(()=>{}); } catch(e){}
        return resolve();
      }

      h.on(Hls.Events.ERROR, onError);
      h.on(Hls.Events.MANIFEST_PARSED, onManifest);
      h.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
      h.on(Hls.Events.FRAG_LOADED, onFragLoaded);

      try {
        h.loadSource(url);
        h.attachMedia(videoEl);
        // start load explicitly (helps some WebViews)
        try { h.startLoad && h.startLoad(0); } catch(e){}
      } catch (e) {
        cleanupHandlers();
        try { h.destroy(); } catch(err){}
        hlsInst = null;
        return reject(e);
      }
    });
  }

  // ---------- play current with conservative sequence ----------
  async function playCurrent() {
    if (playLock) { console.warn('play locked: skipping'); return; }
    playLock = true;

    const item = playlist[currentIndex];
    if (!item) { playLock = false; return; }

    const url = (item.file||'').trim();
    if (!url) { showStatus('URL inválida'); playLock = false; return; }

    // reset retry counter for this manual change
    retryCounts.hlsLevel = 0;

    // spinner
    spinnerEl && spinnerEl.classList && spinnerEl.classList.remove('hidden');
    showStatus('Intentando: ' + url, 2200);

    // clean video element before attach to avoid stuck pipelines
    try { videoEl.pause(); } catch(e){}
    try { videoEl.removeAttribute('src'); videoEl.load(); } catch(e){}
    await sleep(180);

    // sequence: try HLS (worker true) -> HLS (worker false) -> manifest->blob -> native -> proxy if configured
    const attempts = [
      { fn: () => loadWithHls(url, { enableWorker: true, withCredentials: !!item.withCredentials }) , label: 'HLS (worker:true)' },
      { fn: () => loadWithHls(url, { enableWorker: false, withCredentials: !!item.withCredentials }), label: 'HLS (worker:false)' },
      { fn: async () => {
          // manifest->blob - convert relative URIs to absolute (but this might fail if manifest CORS blocked)
          const manifestText = await (await fetch(url, { cache:'no-store' })).text();
          const base = url.replace(/\/[^\/]*$/, '/');
          const lines = manifestText.split(/\r?\n/).map(l => {
            if (l && l[0] !== '#') {
              if (!/^https?:\/\//i.test(l)) return base + l;
            }
            return l;
          }).join('\n');
          const blobUrl = URL.createObjectURL(new Blob([lines], { type: 'application/vnd.apple.mpegurl' }));
          try {
            const res = await loadWithHls(blobUrl, { enableWorker: false, withCredentials: !!item.withCredentials });
            URL.revokeObjectURL(blobUrl);
            return res;
          } catch(e) {
            try { URL.revokeObjectURL(blobUrl); } catch(_) {}
            throw e;
          }
        }, label: 'manifest->blob -> HLS' },
      { fn: async () => { videoEl.src = url; videoEl.load(); try { await videoEl.play().catch(()=>{}); } catch(e){} }, label: 'Native fallback' }
    ];

    // If the playlist item has property forceProxy=true or if CONFIG.proxyPrefix set and host is known bad, try proxy last
    if (CONFIG.proxyPrefix && item.forceProxy) {
      attempts.push({ fn: async () => { const prox = CONFIG.proxyPrefix + encodeURIComponent(url); return loadWithHls(prox, { enableWorker:false, withCredentials:false }); }, label: 'HLS via proxy' });
    } else if (CONFIG.proxyPrefix) {
      attempts.push({ fn: async () => { const prox = CONFIG.proxyPrefix + encodeURIComponent(url); try { return await loadWithHls(prox, { enableWorker:false }); } catch(e) { /* ignore */ } }, label: 'Proxy fallback' });
    }

    let success = false;
    for (const a of attempts) {
      try {
        showStatus(a.label, 1800);
        await a.fn();
        success = true;
        hideStatus();
        spinnerEl && spinnerEl.classList.add('hidden');
        startWatchdog();
        break;
      } catch (err) {
        console.warn('[player] attempt failed:', a.label, err);
        // small backoff before next attempt
        await sleep(350);
      }
    }

    if (!success) {
      spinnerEl && spinnerEl.classList.add('hidden');
      showPermanentStatus('No se pudo reproducir. Posible bloqueo CORS/Referer. Prueba con proxy.');
    }

    playLock = false;
  }

  // ---------- Watchdog: detecta stall y reintenta una vez (con backoff) ----------
  function startWatchdog() {
    stopWatchdog();
    let last = videoEl.currentTime;
    watchdogTimer = setInterval(async () => {
      try {
        if (!videoEl.paused && !videoEl.ended) {
          const now = videoEl.currentTime;
          if (Math.abs(now - last) < 0.02) {
            console.warn('[watchdog] stall detected, attempting gentle recovery');
            // gentle recovery: try to restart load with worker toggled
            stopWatchdog();
            try {
              if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
              await sleep(300);
              // try worker=false quick attempt
              await loadWithHls(playlist[currentIndex].file, { enableWorker:false, withCredentials: !!playlist[currentIndex].withCredentials });
              spinnerEl && spinnerEl.classList.add('hidden');
              startWatchdog();
              return;
            } catch(e) {
              console.warn('[watchdog] gentle recovery failed', e);
            }
          } else {
            last = now;
          }
        } else {
          last = videoEl.currentTime;
        }
      } catch(e){}
    }, CONFIG.watchdogInterval);
  }
  function stopWatchdog() { if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; } }

  // ---------- UI bindings básico para teclado/carousel minimal (no cambie tu UI) ----------
  function bindUI() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','Enter',' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowUp') { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; renderCarousel(); }
      else if (e.key === 'ArrowDown') { currentIndex = (currentIndex + 1) % playlist.length; renderCarousel(); }
      else if (e.key === 'Enter' || e.key === ' ') { playCurrent(); }
    });
    // basic click to show/hide playlist (if you have a button you can hook)
  }

  // ---------------- bootstrap ----------------
  (async function bootstrap(){
    bindUI();
    const ok = await loadPlaylistFromServer();
    if (!ok) {
      showPermanentStatus('No se pudo cargar playlist.json ni playlist-inline. Revisa la ruta.');
      console.error('playlist load failed');
      return;
    }
    renderCarousel();

    // start playing first item (but wait a tick so UI renders)
    setTimeout(() => {
      playCurrent().catch(e => console.warn('playCurrent error', e));
    }, 300);
  })();

  // expose for debugging in console
  window._player_debug = {
    playCurrent, playlist, getPlaylist: () => playlist, playIndex: (i)=> { currentIndex = i; renderCarousel(); playCurrent(); },
    setProxy: (p)=> CONFIG.proxyPrefix = p, statusEl
  };

})();
