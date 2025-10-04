/* player2.js - Versión simplificada y corregida
   - Intento de reproducción con audio cuando sea posible (si el navegador lo permite)
   - Orden de intentos HLS optimizado para velocidad (worker:false primero)
   - No se fuerza prewarm/manifest->blob (reduce latencia)
   - Touch drag del carrusel sólo en pantallas no-móviles -> permite scroll nativo en mobile
   - Exposición de debug corto en window._player_debug
*/

(function(){
  // ---------- DOM ----------
  const videoEl = document.getElementById('player-video');
  const playlistEl = document.getElementById('carouselList');
  const playlistContainer = document.getElementById('playlist-container');
  const spinnerEl = document.getElementById('video-loading-spinner');

  // audio panel (si existe en tu HTML/CSS)
  let audioPanel = document.getElementById('audio-panel');
  let audioSelect = document.getElementById('audio-select');

  // crear status si no existe
  let statusEl = document.getElementById('player-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'player-status';
    statusEl.className = 'player-status hidden';
    document.body.appendChild(statusEl);
  }

  // ---------- CONFIG ----------
  const CONFIG = {
    playlistUrl: 'playlist.json',
    proxyPrefix: '',    // si deseas usar proxy: 'http://mi-proxy:3000/proxy?url='
    remuxApiPrefix: '', // si usas remux: 'http://mi-proxy:3000/remux?url='
    maxLocalRetries: 2,
    watchdogInterval: 7000
  };

  // ---------- STATE ----------
  let playlist = [];
  let currentIndex = 0;
  let hlsInst = null;
  let playLock = false;
  let watchdogTimer = null;
  let userMuted = false; // si el usuario explicitamente muteó

  // detectar mobile (para permitir scroll nativo)
  const isMobile = (() => {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    } catch(e) {
      return ('ontouchstart' in window) && window.innerWidth <= 1024;
    }
  })();

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- UI helpers ----------
  function showStatus(msg, ms = 2200){
    try {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      if (ms) setTimeout(()=>statusEl.classList.add('hidden'), ms);
    } catch(e){}
  }
  function showPermanent(msg){
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
  }
  function hideStatus(){ try{ statusEl.classList.add('hidden'); }catch(e){} }

  // asegurarnos del panel de audio
  function ensureAudioPanel(){
    if (!audioPanel) {
      // no forzamos crear elementos si ya tienes CSS; se crea minimal aqui para debugging
      audioPanel = document.createElement('div');
      audioPanel.id = 'audio-panel';
      audioPanel.className = 'audio-panel hidden';
      audioPanel.style.position = 'absolute';
      audioPanel.style.right = '12px';
      audioPanel.style.top = '56px';
      audioPanel.style.zIndex = 1200;
      const icon = document.createElement('i');
      icon.className = 'bi bi-volume-mute-fill';
      icon.style.cursor = 'pointer';
      audioPanel.appendChild(icon);
      audioSelect = document.createElement('select');
      audioSelect.id = 'audio-select';
      audioPanel.appendChild(audioSelect);
      document.body.appendChild(audioPanel);
      icon.addEventListener('click', () => toggleMute());
    }
  }
  ensureAudioPanel();

  function toggleMute(){
    userMuted = !userMuted;
    try {
      videoEl.muted = userMuted;
      videoEl.volume = userMuted ? 0 : 1;
      const icon = audioPanel.querySelector('i');
      if (icon) icon.className = userMuted ? 'bi bi-volume-mute-fill' : 'bi bi-volume-up-fill';
      showStatus(userMuted ? 'Silenciado' : 'Audio activado', 1200);
    } catch(e){ console.warn('toggleMute', e); }
  }

  // intento de reproducir con audio si es posible; si falla, cae a mute y muestra control
  async function attemptPlayWithAudioFallback(){
    // respetar si usuario silenció explícitamente
    if (userMuted) { videoEl.muted = true; videoEl.volume = 0; return; }

    // primer intento: desmutear y play()
    try {
      videoEl.muted = false;
      videoEl.volume = 1;
      await videoEl.play();
      // éxito — dejar audio activo
      if (audioPanel) {
        audioPanel.classList.remove('hidden');
        const icon = audioPanel.querySelector('i'); if (icon) icon.className = 'bi bi-volume-up-fill';
      }
      return true;
    } catch(err) {
      // autoplay con audio bloqueado -> intentar con muted autoplay
      try {
        videoEl.muted = true;
        videoEl.volume = 0;
        await videoEl.play().catch(()=>{});
        // mostramos control para que el usuario pueda habilitar audio
        if (audioPanel) audioPanel.classList.remove('hidden');
        showStatus('Pulsa el icono de audio para activar sonido', 4000);
      } catch(e){}
      return false;
    }
  }

  // poblar pistas de audio desde Hls
  function populateAudioTracks(hlsAudioTracks){
    if (!audioPanel || !audioSelect) return;
    audioSelect.innerHTML = '';
    hlsAudioTracks.forEach((t,i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = t.lang || t.name || t.label || `Track ${i+1}`;
      audioSelect.appendChild(o);
    });
    audioSelect.onchange = () => {
      const idx = parseInt(audioSelect.value);
      try { if (hlsInst && typeof hlsInst.audioTrack !== 'undefined') hlsInst.audioTrack = idx; } catch(e){}
      try {
        if (videoEl && videoEl.audioTracks && videoEl.audioTracks.length) {
          for (let i=0;i<videoEl.audioTracks.length;i++) videoEl.audioTracks[i].enabled = (i === idx);
        }
      } catch(e){}
    };
    audioPanel.classList.remove('hidden');
  }

  // ---------- Playlist load (JSON) with inline fallback ----------
  async function loadPlaylist(){
    try {
      const r = await fetch(CONFIG.playlistUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) throw new Error('playlist.json inválido');
      playlist = data;
      console.info('[player] playlist cargada (JSON)', playlist.length);
      return true;
    } catch(e) {
      console.warn('[player] playlist.json failed', e);
      // fallback: buscar <script id="playlist-inline">
      try {
        const el = document.getElementById('playlist-inline');
        if (el) {
          const parsed = JSON.parse(el.textContent || el.innerText || '[]');
          if (Array.isArray(parsed) && parsed.length) {
            playlist = parsed;
            console.info('[player] playlist cargada (inline fallback)');
            return true;
          }
        }
      } catch(err){}
      return false;
    }
  }

  // ---------- Carousel render (minimal) ----------
  function renderCarousel(){
    playlistEl.innerHTML = '';
    if (!playlist.length) return;
    const visible = 7; const half = Math.floor(visible/2);
    for (let off=-half; off<=half; off++){
      const idx = ((currentIndex + off) % playlist.length + playlist.length) % playlist.length;
      playlistEl.appendChild(createItem(idx));
    }
    updateFocus();
  }
  function createItem(idx){
    const it = playlist[idx] || {};
    const div = document.createElement('div');
    div.className = 'carousel-item';
    div.dataset.idx = idx;
    div.tabIndex = 0;
    div.innerHTML = `<div class="item-label"><span>${it.number||''}</span></div><img src="${it.image||''}" alt="${it.title||''}"><button class="carousel-button">${it.title||''}</button>`;
    div.addEventListener('click', ()=>{ currentIndex = idx; playCurrent(); });
    return div;
  }
  function updateFocus(){
    const kids = playlistEl.children;
    const mid = Math.floor(kids.length/2);
    for (let i=0;i<kids.length;i++) kids[i].classList.toggle('focused', i===mid);
  }

  // ---------- Hls loader (simplificado y optimizado) ----------
  function createHlsInstance(opts={}){
    if (!window.Hls || !Hls.isSupported()) return null;
    const cfg = Object.assign({
      enableWorker: opts.enableWorker !== undefined ? opts.enableWorker : false, // worker:false por defecto (mejor en WebView)
      startFragPrefetch: opts.startFragPrefetch !== undefined ? opts.startFragPrefetch : false,
      maxBufferLength: 60,
      fragLoadingTimeOut: 20000,
      manifestLoadingTimeOut: 20000,
      levelLoadingTimeOut: 20000
    }, opts);
    const h = new Hls(cfg);
    // no forzamos withCredentials globalmente
    h.config.xhrSetup = function(xhr) {
      try { xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
    };
    return h;
  }

  function loadWithHls(url, options={}){
    return new Promise((resolve, reject) => {
      const h = createHlsInstance(options);
      if (!h) return reject(new Error('Hls no disponible'));

      if (options.withCredentials) {
        h.config.xhrSetup = function(xhr) {
          try { xhr.withCredentials = true; xhr.setRequestHeader && xhr.setRequestHeader('X-Requested-With','XMLHttpRequest'); } catch(e){}
        };
      }

      if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
      hlsInst = h;

      let localRetry = 0;
      const maxLocal = CONFIG.maxLocalRetries;

      const cleanup = () => {
        try { h.off(Hls.Events.ERROR, onError); } catch(e){}
        try { h.off(Hls.Events.MANIFEST_PARSED, onManifest); } catch(e){}
        try { h.off(Hls.Events.LEVEL_LOADED, onLevelLoaded); } catch(e){}
        try { h.off(Hls.Events.FRAG_LOADED, onFragLoaded); } catch(e){}
      };

      function onError(ev, data){
        console.warn('[Hls error]', data);
        showStatus('HLS: ' + (data && data.details ? data.details : data.type), 2000);
        const det = (data && data.details || '').toLowerCase();
        if (det.includes('level') || det.includes('frag') || det.includes('manifest') || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          localRetry++;
          if (localRetry <= maxLocal) {
            try { h.startLoad && h.startLoad(); } catch(e){}
            return;
          } else {
            cleanup();
            try { h.destroy(); } catch(e){}
            hlsInst = null;
            return reject(new Error('Hls failed after local retries: ' + (data.details||data.type)));
          }
        }
        if (data && data.fatal) {
          cleanup();
          try { h.destroy(); } catch(e){}
          hlsInst = null;
          return reject(new Error('Hls fatal: ' + (data.details||data.type)));
        }
      }

      function onManifest(){ /* wait for level or frag */ }
      function onLevelLoaded(){ cleanup(); try { videoEl.play().catch(()=>{}); } catch(e){} resolve(); }
      function onFragLoaded(){ cleanup(); try { videoEl.play().catch(()=>{}); } catch(e){} resolve(); }

      h.on(Hls.Events.ERROR, onError);
      h.on(Hls.Events.MANIFEST_PARSED, onManifest);
      h.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
      h.on(Hls.Events.FRAG_LOADED, onFragLoaded);
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        try { if (h.audioTracks && h.audioTracks.length > 1) populateAudioTracks(h.audioTracks); } catch(e){}
      });

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

  // ---------- Play sequence (rápida) ----------
  async function playCurrent(){
    if (playLock) return;
    playLock = true;

    const item = playlist[currentIndex];
    if (!item) { playLock = false; return; }
    const url = (item.file || '').trim();
    if (!url) { showStatus('URL inválida'); playLock = false; return; }

    // limpiar
    try { videoEl.pause(); } catch(e){} try { videoEl.removeAttribute('src'); videoEl.load(); } catch(e){}
    spinnerEl && spinnerEl.classList.remove('hidden');
    showStatus('Cargando: ' + url, 1200);

    await sleep(120); // breve pausa para liberar recursos

    // Intentos rápidos y ordenados: worker:false -> worker:true -> native -> proxy/remux
    const attempts = [
      { label: 'HLS (worker:false)', fn: () => loadWithHls(url, { enableWorker:false, startFragPrefetch:false, withCredentials: !!item.withCredentials }) },
      { label: 'HLS (worker:true)', fn: () => loadWithHls(url, { enableWorker:true, startFragPrefetch:false, withCredentials: !!item.withCredentials }) },
      { label: 'Fallback nativo', fn: async () => { try { videoEl.src = url; videoEl.load(); await videoEl.play().catch(()=>{}); } catch(e){} } }
    ];

    if (CONFIG.proxyPrefix) attempts.push({ label: 'Proxy passthrough', fn: () => loadWithHls(CONFIG.proxyPrefix + encodeURIComponent(url), { enableWorker:false }) });
    if (CONFIG.remuxApiPrefix) attempts.push({ label: 'Remux server', fn: async () => {
      const api = CONFIG.remuxApiPrefix + encodeURIComponent(url);
      const r = await fetch(api, { cache:'no-store' });
      if (!r.ok) throw new Error('remux API ' + r.status);
      const body = await r.json();
      if (!body || !body.playlist) throw new Error('remux API invalid');
      await loadWithHls(body.playlist, { enableWorker:false });
    }});

    let success = false;
    for (const a of attempts) {
      try {
        showStatus(a.label, 1600);
        await a.fn();
        success = true;
        hideStatus();
        spinnerEl && spinnerEl.classList.add('hidden');
        // asegurar audio si posible
        await attemptPlayWithAudioFallback();
        startWatchdog();
        break;
      } catch(err) {
        console.warn('[player] intento fallido', a.label, err);
        await sleep(250);
      }
    }

    if (!success) {
      spinnerEl && spinnerEl.classList.add('hidden');
      showPermanent('No se pudo reproducir. Usa proxy/remux si es necesario.');
    }

    playLock = false;
  }

  // ---------- Watchdog ----------
  function startWatchdog(){
    stopWatchdog();
    let last = videoEl.currentTime;
    watchdogTimer = setInterval(async () => {
      try {
        if (!videoEl.paused && !videoEl.ended) {
          const now = videoEl.currentTime;
          if (Math.abs(now - last) < 0.02) {
            console.warn('[watchdog] stall detected -> recovery');
            stopWatchdog();
            if (hlsInst) { try { hlsInst.destroy(); } catch(e){} hlsInst = null; }
            await sleep(300);
            try { await loadWithHls(playlist[currentIndex].file, { enableWorker:false }); } catch(e){}
            startWatchdog();
          } else last = now;
        } else last = videoEl.currentTime;
      } catch(e){}
    }, CONFIG.watchdogInterval);
  }
  function stopWatchdog(){ if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; } }

  // ---------- Touch drag: solo si NO es mobile (si es mobile dejamos scroll nativo) ----------
  function initCarouselTouch(){
    const wrapper = playlistContainer.querySelector('.carousel-wrapper');
    const listEl = playlistEl;
    if (!wrapper || isMobile) return; // no attach touch handlers on mobile
    let startY = 0, itemH = 0, baseY = 0, dragging=false;
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
    });
  }

  // ---------- Event binding ----------
  videoEl.addEventListener('playing', () => { try { spinnerEl && spinnerEl.classList.add('hidden'); } catch(e){} });
  videoEl.addEventListener('waiting', () => { try { spinnerEl && spinnerEl.classList.remove('hidden'); } catch(e){} });
  videoEl.addEventListener('error', () => { console.warn('[video] error element -> reload'); playCurrent(); });

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','Enter',' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp') { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; renderCarousel(); }
    else if (e.key === 'ArrowDown') { currentIndex = (currentIndex + 1) % playlist.length; renderCarousel(); }
    else if (e.key === 'Enter' || e.key === ' ') { playCurrent(); }
  });

  // ---------- Bootstrap ----------
  (async function bootstrap(){
    const ok = await (async ()=>{ try { return await loadPlaylist(); } catch(e){ return false; } })();
    if (!ok) { showPermanent('Error cargando playlist.json — revisa consola'); return; }
    renderCarousel();
    initCarouselTouch(); // attach only if not mobile
    setTimeout(()=>{ playCurrent().catch(e=>console.warn('initial play error', e)); }, 300);
  })();

  // expose debug
  window._player_debug = {
    playlist,
    playIndex: i => { currentIndex = i; renderCarousel(); playCurrent(); },
    setProxy: p => CONFIG.proxyPrefix = p,
    setRemuxApi: r => CONFIG.remuxApiPrefix = r,
    toggleMute: () => toggleMute()
  };

})();
