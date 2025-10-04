/* player2.js — Corrección focal: manejo de level/frag/manifest load errors y reducción del freeze inicial.
   Reemplaza por completo tu player2.js actual. Mantengo el resto de la lógica/UI intacta. */

class PlayerJS {
  constructor() {
    this.videoEl      = document.getElementById("player-video");
    this.playlistEl   = document.getElementById("carouselList");
    this.containerEl  = document.getElementById("playlist-container");
    this.spinnerEl    = document.getElementById("video-loading-spinner");

    this.menuEl      = document.getElementById("tv-menu");
    this.imgEl       = document.getElementById("tv-menu-img");
    this.chanNumEl   = document.getElementById("tv-menu-channel-number");
    this.qualityEl   = document.getElementById("tv-menu-quality");
    this.timeEl      = document.getElementById("tv-menu-time");
    this.btnReturn   = document.getElementById("btn-return");
    this.btnList     = document.getElementById("btn-list");
    this.btnPause    = document.getElementById("btn-pause");
    this.iconPause   = document.getElementById("icon-pause");
    this.btnLive     = document.getElementById("btn-live");
    this.iconLive    = document.getElementById("icon-live");
    this.btnClose    = document.getElementById("btn-close");
    this.tooltipEl   = document.getElementById("tv-menu-tooltip");

    this.dvrContainer = document.getElementById("dvr-container");
    this.dvrProgress  = document.getElementById("dvr-progress");
    this.dvrKnob      = document.getElementById("dvr-knob");

    this.overlayActive = false;
    this.menuTimer     = null;
    this.dvrInterval   = null;

    this.currentIndex      = 0;
    this.playbackIndex     = 0;
    this.hasUncommittedNav = false;

    this.playlist      = [];
    this.hls           = null;
    this.shakaPlayer   = null;

    this.lastNavTime   = Date.now();
    this.autoHide      = 5000;

    this.visibleCount  = 7;
    this.half          = Math.floor(this.visibleCount / 2);

    this._touchStartY  = 0;
    this._isDragging   = false;

    // configurables
    this.config = {
      playlistUrl: 'playlist.json',
      proxyPrefix: '' // si tienes proxy coloca aquí el prefijo (ej. 'http://mi-proxy:3000/proxy?url=')
    };

    // contadores de reintento para evitar loops
    this._errorRetryCount = 0;
    this._maxErrorRetries = 4;

    // audio select
    this.audioSelectEl = document.getElementById('audio-select');
    if (!this.audioSelectEl) {
      try {
        this.audioSelectEl = document.createElement('select');
        this.audioSelectEl.id = 'audio-select';
        this.audioSelectEl.style.position = 'absolute';
        this.audioSelectEl.style.right = '12px';
        this.audioSelectEl.style.top = '12px';
        this.audioSelectEl.style.zIndex = 9999;
        this.audioSelectEl.style.padding = '6px';
        this.audioSelectEl.style.display = 'none';
        (this.menuEl || document.body).appendChild(this.audioSelectEl);
      } catch(e){}
    }

    this._watchdogTimer = null;

    this.init();
  }

  init() {
    this.updateClock();
    setInterval(() => this.updateClock(), 60000);

    this.addUIListeners();
    this.initMenuActions();
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
    this.monitorPlayback();

    setInterval(() => {
      if (!this.overlayActive && Date.now() - this.lastNavTime > this.autoHide) {
        this.hideUI();
      }
    }, 500);

    this.initTouchDrag();
  }

  updateClock() {
    const d = new Date();
    let h = d.getHours() % 12 || 12;
    let m = String(d.getMinutes()).padStart(2, "0");
    this.timeEl.textContent = `${h}:${m}`;
  }

  initMenuActions() {
    this.btnReturn.addEventListener("click", () => history.back());
    this.btnList.addEventListener("click", () => { this.hideMenu(); this.showUI(); });

    this.btnPause.addEventListener("click", () => {
      if (this.videoEl.paused) {
        this.videoEl.play();
        this.iconPause.className = "bi bi-pause-circle-fill";
        this.btnPause.dataset.title = "Pausa";
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
      } else {
        this.videoEl.pause();
        this.iconPause.className = "bi bi-play-circle-fill";
        this.btnPause.dataset.title = "Reanudar";
        this.iconLive.style.color = "gray";
        this.startDvrInterval();
      }
      this.resetMenuTimer();
    });

    this.btnLive.addEventListener("click", () => {
      const buf = this.videoEl.buffered;
      if (buf.length > 0) {
        const livePoint = buf.end(buf.length - 1);
        this.videoEl.currentTime = livePoint;
      }
      this.videoEl.play();
      this.iconPause.className = "bi bi-pause-circle-fill";
      this.btnPause.dataset.title = "Pausa";
      this.iconLive.style.color = "red";
      this.stopDvrInterval();
      this.resetMenuTimer();
    });

    this.btnClose.addEventListener("click", () => this.hideMenu());

    [
      this.btnReturn,
      this.btnList,
      this.btnPause,
      this.btnLive,
      this.btnClose
    ].forEach(btn => { btn.addEventListener("focus", () => this.showTooltip(btn)); });
  }

  showMenu() {
    this.overlayActive = true;
    this.containerEl.classList.remove("active");
    const cur = this.playlist[this.playbackIndex] || {};
    this.imgEl.src = cur.image || "";
    this.chanNumEl.textContent = cur.number || "";
    this.qualityEl.textContent = `${this.videoEl.videoWidth}×${this.videoEl.videoHeight}`;
    this.menuEl.classList.remove("hidden");
    this.btnReturn.focus();
    this.resetMenuTimer();
  }

  hideMenu() {
    this.overlayActive = false;
    this.menuEl.classList.add("hidden");
    this.hideTooltip();
    clearTimeout(this.menuTimer);
    this.stopDvrInterval();
  }

  resetMenuTimer() {
    clearTimeout(this.menuTimer);
    this.menuTimer = setTimeout(() => this.hideMenu(), 5000);
  }

  showTooltip(btn) {
    const title = btn.dataset.title || "";
    this.tooltipEl.textContent = title;
    this.tooltipEl.classList.remove("hidden");
    this.tooltipEl.classList.add("visible");
    const rect = btn.getBoundingClientRect();
    this.tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    this.resetMenuTimer();
  }

  hideTooltip() {
    this.tooltipEl.classList.remove("visible");
    this.tooltipEl.classList.add("hidden");
  }

  showUI() {
    if (!this.overlayActive && this.hasUncommittedNav) {
      this.currentIndex = this.playbackIndex;
      this.renderCarousel();
      this.updateCarousel(false);
      this.hasUncommittedNav = false;
    }
    this.containerEl.classList.add("active");
    this.lastNavTime = Date.now();
  }

  hideUI() {
    if (!this.overlayActive) {
      this.containerEl.classList.remove("active");
    }
  }

  loadPlaylist(arr) {
    this.playlist = arr;
    this.currentIndex = 0;
    this.playbackIndex = 0;
    this.hasUncommittedNav = false;
    this.renderCarousel();
    this.updateCarousel(false);

    if (this.playlist.length > 0) {
      const firstIndex = 0;
      const timeoutMs = 2500;
      let finished = false;

      this.prewarmChannel(firstIndex)
        .then(() => {
          finished = true;
          if (this.currentIndex === firstIndex) this.playCurrent();
        })
        .catch(() => {});

      setTimeout(() => {
        if (!finished) this.playCurrent();
      }, timeoutMs);
    }
  }

  createItem(idx) {
    const data = this.playlist[idx] || {};
    const item = document.createElement("div");
    item.className = "carousel-item";
    item.dataset.idx = idx;
    const lbl = document.createElement("div");
    lbl.className = "item-label";
    lbl.innerHTML = `<span>${data.number || ""}</span>`;
    const img = document.createElement("img");
    img.src = data.image || "";
    img.alt = data.title || "";
    const btn = document.createElement("button");
    btn.className = "carousel-button";
    btn.textContent = data.title || "";
    item.append(lbl, img, btn);
    item.addEventListener("click", () => {
      this.currentIndex = idx;
      this.play();
    });
    item.addEventListener("touchend", e => {
      e.preventDefault();
      this.currentIndex = idx;
      this.play();
    });
    return item;
  }

  renderCarousel() {
    const N = this.playlist.length;
    this.playlistEl.innerHTML = "";
    for (let off = -this.half; off <= this.half; off++) {
      const idx = ((this.currentIndex + off) % N + N) % N;
      this.playlistEl.appendChild(this.createItem(idx));
    }
  }

  updateCarousel(animate = true) {
    const items = this.playlistEl.children;
    if (!items.length) return;
    const st = getComputedStyle(items[0]);
    const itemH = items[0].offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
    const wrapH = this.containerEl.querySelector(".carousel-wrapper").clientHeight;
    const baseY = wrapH / 2 - itemH / 2 - this.half * itemH;
    this.playlistEl.style.transition = animate ? "transform .3s ease" : "none";
    this.playlistEl.style.transform = `translateY(${baseY}px)`;
    Array.from(items).forEach((el, i) => { el.classList.toggle("focused", i === this.half); });
    if (!animate) { void this.playlistEl.offsetWidth; this.playlistEl.style.transition = "transform .3s ease"; }
  }

  move(dir) {
    const N = this.playlist.length;
    this.currentIndex = (this.currentIndex + dir + N) % N;
    this.hasUncommittedNav = true;
    this.lastNavTime = Date.now();
    this.renderCarousel();
    this.updateCarousel(true);
  }

  // Helper small sleep
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ---------- reproducción robusta (con mejoras) ----------
  async playCurrent() {
    const f = this.playlist[this.currentIndex] || {};
    this.playbackIndex = this.currentIndex;
    this.hasUncommittedNav = false;

    // reset error retry count on manual change
    this._errorRetryCount = 0;

    if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
    if (this.shakaPlayer) { try { this.shakaPlayer.destroy(); } catch(e){} this.shakaPlayer = null; }

    let url = (f.file || "").trim();
    if (!url) return;

    this.spinnerEl.classList.remove("hidden");

    try { this.videoEl.crossOrigin = 'anonymous'; } catch(e){}
    try { this.videoEl.setAttribute('playsinline', ''); } catch(e){}
    try { this.videoEl.preload = 'metadata'; } catch(e){}

    const maybeWithProxy = (u) => {
      const pref = (this.config && this.config.proxyPrefix) ? this.config.proxyPrefix.trim() : '';
      if (!pref) return u;
      if (u.indexOf(pref) === 0) return u;
      return pref + encodeURIComponent(u);
    };

    // ensure video element is clean before creating Hls (fixes certain freeze cases)
    try {
      try { this.videoEl.pause(); } catch(e){}
      try { this.videoEl.removeAttribute('src'); } catch(e){}
      try { this.videoEl.load(); } catch(e){}
      // small pause to ensure browser releases any previous media pipelines
      await this._sleep(200);
    } catch(e){}

    // HLS factory with sane defaults
    const createHlsInstance = (opts = {}) => {
      if (!window.Hls || !Hls.isSupported()) return null;
      try {
        const cfg = Object.assign({
          maxBufferLength: 60,
          liveSyncDurationCount: 3,
          enableWorker: true,
          startFragPrefetch: true,
          maxMaxBufferLength: 600,
          fragLoadingTimeOut: 30000,        // más tolerancia
          manifestLoadingTimeOut: 30000,
          levelLoadingTimeOut: 20000,
          loader: undefined,
          maxBufferHole: 0.7
        }, opts);
        const hls = new Hls(cfg);

        // xhrSetup: conCredentials + cabeceras básicas (algunos hosts requieren cookies/session)
        hls.config.xhrSetup = function(xhr, url) {
          try {
            xhr.withCredentials = true;
            try { xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); } catch(e){}
            try { xhr.setRequestHeader('Accept', '*/*'); } catch(e){}
          } catch(e){}
        };

        return hls;
      } catch (e) {
        console.warn('Hls init threw', e);
        return null;
      }
    };

    // try loader with promise and richer handling (resolving when level/frag loaded)
    const tryLoadWithHlsConfig = (u, hlsOpts = {}) => {
      return new Promise((resolve, reject) => {
        const hls = createHlsInstance(hlsOpts);
        if (!hls) return reject(new Error('Hls not available'));

        // cleanup previous
        if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
        this.hls = hls;

        let fatalCount = 0;
        const maxFatal = 2;

        // handlers
        const onError = (event, data) => {
          console.warn('[Hls error]', data);
          // network/level/frag/manifest errors: short-circuit to try next strategy
          if (data && data.fatal) {
            fatalCount++;
            // if it's network related and we haven't retried too many times, stop and reject to go to next attempt
            const details = (data.details || '').toLowerCase();
            if (details.includes('manifest') || details.includes('level') || details.includes('frag') || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              cleanup();
              try { hls.destroy(); } catch(e){}
              this.hls = null;
              return reject(new Error('Hls fatal network/manifest/level/frag error: ' + (data.details || data.type)));
            }
            // other recoverable media errors
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              try { hls.recoverMediaError(); } catch(e){}
              return;
            }
            // fallback: if repeated fatal errors, reject
            if (fatalCount > maxFatal) {
              cleanup();
              try { hls.destroy(); } catch(e){}
              this.hls = null;
              return reject(new Error('Hls fatal repeated'));
            }
          }
        };

        const onManifestParsed = () => {
          // call startLoad to ensure fragments are requested
          try {
            if (hls.startLoad) hls.startLoad();
          } catch(e){}
          // populate audio tracks if exist
          try {
            if (hls.audioTracks && hls.audioTracks.length > 1) {
              this.populateAudioTracks(hls.audioTracks);
            } else if (this.audioSelectEl) {
              this.audioSelectEl.style.display = 'none';
            }
          } catch(e){}
          // often manifest parsed means timeline ready; but wait until a level or frag loads
          // We'll resolve on LEVEL_LOADED or FRAG_LOADED below.
        };

        const onLevelLoaded = (event, data) => {
          // level info available -> safe to play
          cleanup();
          try { this.videoEl.play().catch(()=>{}); } catch(e){}
          resolve();
        };

        const onFragLoaded = (event, data) => {
          // first fragment loaded -> safe to play
          cleanup();
          try { this.videoEl.play().catch(()=>{}); } catch(e){}
          resolve();
        };

        const cleanup = () => {
          try { hls.off(Hls.Events.ERROR, onError); } catch(e){}
          try { hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed); } catch(e){}
          try { hls.off(Hls.Events.LEVEL_LOADED, onLevelLoaded); } catch(e){}
          try { hls.off(Hls.Events.FRAG_LOADED, onFragLoaded); } catch(e){}
        };

        hls.on(Hls.Events.ERROR, onError);
        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hls.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
        hls.on(Hls.Events.FRAG_LOADED, onFragLoaded);
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          try { if (hls.audioTracks && hls.audioTracks.length > 1) this.populateAudioTracks(hls.audioTracks); } catch(e){}
        });

        try {
          hls.loadSource(u);
          hls.attachMedia(this.videoEl);
          // force startLoad in case some platforms need explicit start
          try { if (hls.startLoad) hls.startLoad(0); } catch(e){}
        } catch (e) {
          cleanup();
          try { hls.destroy(); } catch(e){}
          this.hls = null;
          return reject(e);
        }
      });
    };

    // manifest->blob helper (convert relative URIs)
    const fetchManifestToBlobUrl = async (u) => {
      const resp = await fetch(u, { cache: 'no-store' });
      if (!resp.ok) throw new Error('manifest fetch failed ' + resp.status);
      const text = await resp.text();
      const base = u.replace(/\/[^\/]*$/, '/');
      const lines = text.split(/\r?\n/).map(line => {
        if (line && line[0] !== '#') {
          if (!/^https?:\/\//i.test(line)) return base + line;
        }
        return line;
      }).join('\n');
      const blob = new Blob([lines], { type: 'application/vnd.apple.mpegurl' });
      return URL.createObjectURL(blob);
    };

    // Native fallback
    const tryNativePlay = (u) => {
      try {
        this.videoEl.src = u;
        this.videoEl.load();
        this.videoEl.play().catch(()=>{});
      } catch(e){}
    };

    // start watchdog to detect stalls
    const startWatchdog = (timeoutMs = 6000) => {
      this.stopWatchdog();
      let lastTime = this.videoEl.currentTime;
      this._watchdogTimer = setInterval(() => {
        try {
          if (!this.videoEl.paused && !this.videoEl.ended) {
            const now = this.videoEl.currentTime;
            if (Math.abs(now - lastTime) < 0.01) {
              console.warn('[watchdog] stall detected -> recovery');
              // small backoff and try to recover
              this._errorRetryCount++;
              if (this._errorRetryCount <= this._maxErrorRetries) {
                // destroy HLS and re-run play logic with worker toggled
                if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
                (async () => {
                  await this._sleep(300);
                  // try worker=false as recovery
                  try {
                    await tryLoadWithHlsConfig(url, { enableWorker: false, startFragPrefetch: true });
                    this.spinnerEl.classList.add("hidden");
                    this.iconLive.style.color = "red";
                    this.stopDvrInterval();
                    startWatchdog(7000);
                    return;
                  } catch (e) {
                    console.warn('[watchdog] recovery attempt failed', e);
                  }
                })();
              } else {
                // exceeded retries -> stop watchdog
                this.stopWatchdog();
              }
            } else {
              lastTime = now;
            }
          } else {
            lastTime = this.videoEl.currentTime;
          }
        } catch(e){}
      }, timeoutMs);
    };

    const stopWatchdog = () => {
      if (this._watchdogTimer) { clearInterval(this._watchdogTimer); this._watchdogTimer = null; }
    };
    this.startWatchdog = startWatchdog;
    this.stopWatchdog = stopWatchdog;

    // Attempt sequence (tries several strategies)
    try {
      // 1) HLS worker true
      await tryLoadWithHlsConfig(url, { enableWorker: true, startFragPrefetch: true });
      this.spinnerEl.classList.add("hidden");
      this.videoEl.muted = false;
      this.iconLive.style.color = "red";
      this.stopDvrInterval();
      this.startWatchdog(7000);
      return;
    } catch (e1) {
      console.warn('[player] Hls(worker:true) failed:', e1);
    }

    try {
      // 2) HLS worker false
      await tryLoadWithHlsConfig(url, { enableWorker: false, startFragPrefetch: true });
      this.spinnerEl.classList.add("hidden");
      this.videoEl.muted = false;
      this.iconLive.style.color = "red";
      this.stopDvrInterval();
      this.startWatchdog(7000);
      return;
    } catch (e2) {
      console.warn('[player] Hls(worker:false) failed:', e2);
    }

    try {
      // 3) manifest->blob -> HLS (useful for relative segment URIs)
      const blobUrl = await fetchManifestToBlobUrl(url);
      try {
        await tryLoadWithHlsConfig(blobUrl, { enableWorker: false, startFragPrefetch: true });
        URL.revokeObjectURL(blobUrl);
        this.spinnerEl.classList.add("hidden");
        this.videoEl.muted = false;
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        this.startWatchdog(7000);
        return;
      } catch (e3) {
        try { URL.revokeObjectURL(blobUrl); } catch(e){}
        console.warn('[player] Hls via blob failed:', e3);
      }
    } catch(e) {
      console.warn('[player] fetch manifest->blob failed', e);
    }

    try {
      // 4) native fallback (assign src)
      tryNativePlay(url);
      await this._sleep(1400);
      if (!this.videoEl.paused && !this.videoEl.error) {
        this.spinnerEl.classList.add("hidden");
        this.videoEl.muted = false;
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        this.startWatchdog(7000);
        return;
      }
    } catch(e) {
      console.warn('[player] native fallback error', e);
    }

    // 5) Proxy attempts (if configured)
    if (this.config && this.config.proxyPrefix) {
      const prox = maybeWithProxy(url);
      try {
        await tryLoadWithHlsConfig(prox, { enableWorker: false, startFragPrefetch: true });
        this.spinnerEl.classList.add("hidden");
        this.videoEl.muted = false;
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        this.startWatchdog(7000);
        return;
      } catch (ep) {
        console.warn('[player] Hls via proxy failed', ep);
      }

      try {
        tryNativePlay(prox);
        await this._sleep(1200);
        if (!this.videoEl.paused && !this.videoEl.error) {
          this.spinnerEl.classList.add("hidden");
          this.videoEl.muted = false;
          this.iconLive.style.color = "red";
          this.stopDvrInterval();
          this.startWatchdog(7000);
          return;
        }
      } catch(e) {
        console.warn('[player] native via proxy failed', e);
      }
    }

    // last resort
    try { tryNativePlay(url); } catch(e){ console.error('[player] all attempts failed finally', e); }
    this.spinnerEl.classList.add("hidden");
    this.iconLive.style.color = "red";
    this.stopDvrInterval();
  }

  // prewarm: intenta descargar manifest y hasta 2 segmentos. Usa no-cors como fallback para redes bloqueantes.
  async prewarmChannel(index) {
    try {
      const item = this.playlist[index];
      if (!item) return false;
      let url = item.file;
      if (!url) return false;

      const pref = (this.config && this.config.proxyPrefix) ? this.config.proxyPrefix.trim() : '';
      const urlToFetch = pref ? pref + encodeURIComponent(url) : url;

      const resp = await fetch(urlToFetch, {cache:'no-store'});
      if (!resp.ok) throw new Error('manifest HTTP ' + resp.status);
      const text = await resp.text();

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let candidates = [];
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (L.startsWith('#')) continue;
        let candidate = L;
        if (!/^https?:\/\//i.test(L)) {
          const base = url.replace(/\/[^\/]*$/, '/');
          candidate = base + L;
        }
        if (candidate) candidates.push(candidate);
        if (candidates.length >= 2) break;
      }

      for (let c of candidates) {
        const segUrl = pref ? (pref + encodeURIComponent(c)) : c;
        try {
          // try normal CORS first
          await fetch(segUrl, { method: 'GET', mode: 'cors', cache: 'no-store' });
        } catch(e) {
          // try no-cors as last resort (opaque response) so the network still fetches and warms caches
          try { await fetch(segUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' }); } catch(_){}
        }
      }
      return true;
    } catch (e) {
      console.warn('[player] prewarm failed:', e);
      return false;
    }
  }

  populateAudioTracks(tracks) {
    try {
      if (!this.audioSelectEl) return;
      this.audioSelectEl.innerHTML = '';
      tracks.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        const label = t.name || t.lang || t.label || (`Track ${i+1}`);
        opt.textContent = label;
        this.audioSelectEl.appendChild(opt);
      });
      this.audioSelectEl.style.display = 'block';
      this.audioSelectEl.onchange = () => {
        const idx = parseInt(this.audioSelectEl.value);
        try {
          if (this.hls && typeof this.hls.audioTrack !== 'undefined') {
            this.hls.audioTrack = idx;
          }
        } catch(e){ console.warn(e); }
        try {
          if (this.videoEl.audioTracks && this.videoEl.audioTracks.length) {
            for (let i = 0; i < this.videoEl.audioTracks.length; i++) {
              this.videoEl.audioTracks[i].enabled = (i === idx);
            }
          }
        } catch(e){}
      };
    } catch(e){ console.warn('populateAudioTracks error', e); }
  }

  monitorPlayback() {
    let last = 0;
    setInterval(() => {
      if (!this.videoEl.paused && !this.videoEl.ended) {
        if (this.videoEl.currentTime === last) {
          // en caso de no-progreso, intentar un rebind suave (no llamar repetidamente)
          console.warn('[monitor] detected no-progress, calling lightweight recovery');
          // sólo si no hay ya muchos intentos
          if (this._errorRetryCount < this._maxErrorRetries) {
            this._errorRetryCount++;
            try { if (this.hls) { this.hls.destroy(); this.hls = null; } } catch(e){}
            // reintentar reproducir sin bloquear UI
            this.playCurrent();
          }
        }
        last = this.videoEl.currentTime;
      }
    }, 8000);
  }

  addUIListeners() {
    ["mousemove","click","touchstart"].forEach(ev => window.addEventListener(ev, () => this.showUI()));

    window.addEventListener("keydown", e => {
      const key = e.key;
      const code = e.keyCode;
      if ([
        "ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter",
        "MediaPlayPause","Pause"," " , "ChannelUp","ChannelDown"
      ].includes(key) || [32,179,33,34].includes(code)) {
        e.preventDefault();
      }

      if (key === "MediaPlayPause" || key === "Pause" || code === 179) { this.btnPause.click(); return; }
      if (key === "ChannelUp" || code === 33) { this.move(-1); this.playCurrent(); return; }
      if (key === "ChannelDown" || code === 34) { this.move(1); this.playCurrent(); return; }

      if (this.overlayActive) {
        if (key === "ArrowLeft") {
          if (document.activeElement === this.btnList)    this.btnReturn.focus();
          else if (document.activeElement === this.btnPause) this.btnList.focus();
          else if (document.activeElement === this.btnLive)  this.btnPause.focus();
          else if (document.activeElement === this.btnClose) this.btnLive.focus();
        } else if (key === "ArrowRight") {
          if (document.activeElement === this.btnReturn) this.btnList.focus();
          else if (document.activeElement === this.btnList) this.btnPause.focus();
          else if (document.activeElement === this.btnPause) this.btnLive.focus();
          else if (document.activeElement === this.btnLive)  this.btnClose.focus();
        } else if (key === "Enter") document.activeElement.click();
        this.resetMenuTimer();
        return;
      }

      if (key === "ArrowLeft") { this.showMenu(); return; }
      if (!this.containerEl.classList.contains("active") && (key === "ArrowUp" || key === "ArrowDown")) { this.showUI(); return; }

      if (key === "ArrowUp") this.move(-1);
      else if (key === "ArrowDown") this.move(1);
      else if (key === "Enter") this.playCurrent();
    });

    window.addEventListener("wheel", e => {
      e.preventDefault();
      if (this.overlayActive) return;
      if (!this.containerEl.classList.contains("active")) this.showUI();
      else this.move(e.deltaY > 0 ? 1 : -1);
    });

    this.videoEl.addEventListener("waiting", () => this.spinnerEl.classList.remove("hidden"));
    this.videoEl.addEventListener("playing", () => this.spinnerEl.classList.add("hidden"));
    this.videoEl.addEventListener("error", () => {
      console.warn('[video] element error, trying to reload current channel');
      this.playCurrent();
    });
  }

  initTouchDrag() {
    const wrapper = this.containerEl.querySelector(".carousel-wrapper");
    const listEl  = this.playlistEl;
    let itemH, baseY;
    const recalc = () => {
      const first = listEl.children[0];
      const st = getComputedStyle(first);
      itemH = first.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
      const wrapH = wrapper.clientHeight;
      baseY = wrapH / 2 - itemH / 2 - this.half * itemH;
    };

    wrapper.addEventListener("touchstart", e => {
      recalc();
      this._touchStartY = e.touches[0].clientY;
      this._isDragging  = true;
      listEl.style.transition = "none";
    });

    wrapper.addEventListener("touchmove", e => {
      if (!this._isDragging) return;
      const deltaY = e.touches[0].clientY - this._touchStartY;
      listEl.style.transform = `translateY(${baseY + deltaY}px)`;
    });

    wrapper.addEventListener("touchend", e => {
      if (!this._isDragging) return;
      this._isDragging = false;
      const deltaY = e.changedTouches[0].clientY - this._touchStartY;
      const steps  = Math.round(-deltaY / itemH);
      this.move(steps);
      listEl.style.transition = "transform .3s ease";
      listEl.style.transform = `translateY(${baseY}px)`;
    });
  }

  startDvrInterval() {
    this.stopDvrInterval();
    this.dvrInterval = setInterval(() => {
      const buf = this.videoEl.buffered;
      if (buf.length > 0) {
        const start = buf.start(0);
        const end   = buf.end(buf.length - 1);
        const current = this.videoEl.currentTime;
        const totalRange = end - start;
        if (totalRange > 0) {
          let ratio = (current - start) / totalRange;
          ratio = Math.max(0, Math.min(1, ratio));
          this.dvrProgress.style.width = `${Math.floor(ratio * 100)}%`;
          const containerWidth = this.dvrContainer.clientWidth;
          const knobX = ratio * containerWidth;
          this.dvrKnob.style.transform = `translateX(${knobX}px)`;
        }
      }
    }, 500);
  }

  stopDvrInterval() {
    if (this.dvrInterval) { clearInterval(this.dvrInterval); this.dvrInterval = null; }
  }

  attemptRecoverySequence(url) {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
        await this._sleep(500);
        try {
          await this.playCurrent();
          resolve();
        } catch(e) {
          reject(e);
        }
      } catch(e) { reject(e); }
    });
  }
}

// bootstrap: cargar playlist.json (archivo original usado: player2.js version subida por el usuario). 
document.addEventListener("DOMContentLoaded", () => {
  const player = new PlayerJS();

  const playlistUrl = (player.config && player.config.playlistUrl) ? player.config.playlistUrl : 'playlist.json';
  fetch(playlistUrl, {cache: 'no-store'})
    .then(resp => {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(data => {
      if (!Array.isArray(data) || data.length === 0) {
        console.error('playlist.json está vacío o no es un array válido.');
        try {
          const msg = document.createElement('div');
          msg.textContent = 'Error: playlist.json vacío o inválido';
          msg.style.position = 'absolute';
          msg.style.left = '12px';
          msg.style.top = '12px';
          msg.style.zIndex = 9999;
          msg.style.background = 'rgba(0,0,0,0.6)';
          msg.style.color = 'white';
          msg.style.padding = '8px';
          document.body.appendChild(msg);
        } catch(e){}
        return;
      }
      player.loadPlaylist(data);
    })
    .catch(err => {
      console.error('No se pudo cargar playlist.json', err);
      try {
        const msg = document.createElement('div');
        msg.innerHTML = 'No se pudo cargar <b>playlist.json</b>. Revisa la ruta o configura <code>player.config.playlistUrl</code>.';
        msg.style.position = 'absolute';
        msg.style.left = '12px';
        msg.style.top = '12px';
        msg.style.zIndex = 9999;
        msg.style.background = 'rgba(0,0,0,0.6)';
        msg.style.color = 'white';
        msg.style.padding = '8px';
        document.body.appendChild(msg);
      } catch(e){}
    });
});
