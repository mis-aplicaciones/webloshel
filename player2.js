/* player2.js — versión mejorada: múltiples estrategias HLS, prewarm inicial y watchdog para congelamientos.
   Reemplaza por completo tu archivo anterior. */

// ------------------------ clase PlayerJS -------------------------
class PlayerJS {
  constructor() {
    // Elementos básicos del reproductor (mantenidos como en tu versión)
    this.videoEl      = document.getElementById("player-video");
    this.playlistEl   = document.getElementById("carouselList");
    this.containerEl  = document.getElementById("playlist-container");
    this.spinnerEl    = document.getElementById("video-loading-spinner");

    // Menú TV
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

    // DVR (barra progreso)
    this.dvrContainer = document.getElementById("dvr-container");
    this.dvrProgress  = document.getElementById("dvr-progress");
    this.dvrKnob      = document.getElementById("dvr-knob");

    this.overlayActive = false;
    this.menuTimer     = null;
    this.dvrInterval   = null;

    // Indices y playlist
    this.currentIndex      = 0;
    this.playbackIndex     = 0;
    this.hasUncommittedNav = false;

    // Reproductores
    this.playlist      = [];
    this.hls           = null;
    this.shakaPlayer   = null;

    // Auto-hide
    this.lastNavTime   = Date.now();
    this.autoHide      = 5000;

    // Carrusel
    this.visibleCount  = 7;
    this.half          = Math.floor(this.visibleCount / 2);

    // Touch drag
    this._touchStartY  = 0;
    this._isDragging   = false;

    // Config externa
    this.config = {
      playlistUrl: '../playlist.json',
      proxyPrefix: '' // si necesitas proxy, pon aquí el prefijo (ej. 'https://mi-proxy.com/')
    };

    // Audio select
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

    // Watchdog handle
    this._watchdogTimer = null;

    // Iniciar
    this.init();
  }

  init() {
    this.updateClock();
    setInterval(() => this.updateClock(), 60000);

    this.addUIListeners();
    this.initMenuActions();
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = true; // chivato para evitar bloqueo de autoplay; se puede desmutear después
    this.monitorPlayback();

    // Auto hide playlist
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

  // --- Cambié loadPlaylist para realizar un "pre-warm" del primer canal para evitar el freeze inicial ---
  loadPlaylist(arr) {
    this.playlist = arr;
    this.currentIndex = 0;
    this.playbackIndex = 0;
    this.hasUncommittedNav = false;
    this.renderCarousel();
    this.updateCarousel(false);

    // Prewarm del primer item: intentar fetch del manifiesto y primer segmento antes de play
    if (this.playlist.length > 0) {
      // Pre-warm asíncrono pero iniciamos el play cuando esté listo o tras timeout
      const firstIndex = 0;
      const timeoutMs = 2500; // si el prewarm tarda más, romper y seguir
      let finished = false;

      this.prewarmChannel(firstIndex)
        .then(() => {
          finished = true;
          // iniciar reproducción solo si aún estamos en el primer elemento
          if (this.currentIndex === firstIndex) this.playCurrent();
        })
        .catch(() => {
          // ignorar errores de prewarm
        });

      // fallback: forzamos play si el prewarm tarda demasiado
      setTimeout(() => {
        if (!finished) {
          this.playCurrent();
        }
      }, timeoutMs);
    } else {
      // si no hay items simplemente no hacemos nada
    }
  }

  // ------------------- CARRUSEL ---------------------
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

  // ---------------- Reproducción: robusta para m3u8 ---------------
  playCurrent() {
    const f = this.playlist[this.currentIndex] || {};
    this.playbackIndex = this.currentIndex;
    this.hasUncommittedNav = false;

    // Destruir instancias previas
    if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
    if (this.shakaPlayer) { try { this.shakaPlayer.destroy(); } catch(e){} this.shakaPlayer = null; }

    const origUrl = (f.file || "").trim();
    let url = origUrl;
    const isM3U8 = /\.m3u8($|\?)/i.test(url);

    this.spinnerEl.classList.remove("hidden");

    // Atributos útiles
    try { this.videoEl.crossOrigin = 'anonymous'; } catch(e){}
    try { this.videoEl.setAttribute('playsinline', ''); } catch(e){}
    try { this.videoEl.preload = 'metadata'; } catch(e){}

    // Helper: aplicar proxy si configurado
    const maybeWithProxy = (u) => {
      const pref = (this.config && this.config.proxyPrefix) ? this.config.proxyPrefix.trim() : '';
      if (!pref) return u;
      // evitar duplicar proxy si ya lo contiene
      if (u.indexOf(pref) === 0) return u;
      return pref + u;
    };

    // Native play attempt
    const tryNativePlay = (u) => {
      try {
        console.info('[player] intent: native src ->', u);
        this.videoEl.src = u;
        this.videoEl.load();
        // try autoplay; autoplay may be blocked if not muted
        this.videoEl.play().catch(err => { console.warn('native play() rejected', err); });
      } catch (e) {
        console.warn('native play error', e);
      } finally {
        // spinner será ocultado por event 'playing' o por fallback más abajo
      }
    };

    // Crear Hls con una configuración específica (opción)
    const createHlsInstance = (opts = {}) => {
      if (!window.Hls || !Hls.isSupported()) return null;
      try {
        return new Hls(Object.assign({
          maxBufferLength: 60,
          liveSyncDurationCount: 3,
          enableWorker: true,
          startFragPrefetch: true,
          maxMaxBufferLength: 600,
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 20000,
          maxBufferHole: 0.5
        }, opts));
      } catch (e) {
        console.warn('Hls init threw', e);
        return null;
      }
    };

    // Intento con Hls: devuelve Promise
    const tryLoadWithHlsConfig = (u, hlsOpts = {}) => {
      return new Promise((resolve, reject) => {
        const hls = createHlsInstance(hlsOpts);
        if (!hls) return reject(new Error('Hls not available'));

        // Si ya existe un hls, destruirlo para evitar conflicts
        if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }

        this.hls = hls;
        let recovered = false;
        let fatalCount = 0;
        const maxFatal = 3;

        const onError = (event, data) => {
          console.warn('[Hls error]', data);
          if (data && data.fatal) {
            fatalCount++;
            if (fatalCount > maxFatal) {
              cleanup();
              try { hls.destroy(); } catch(e){}
              this.hls = null;
              return reject(new Error('Hls fatal repeated'));
            }
            // Intentos específicos
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              try { hls.recoverMediaError(); recovered = true; } catch(e){}
            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              try { hls.startLoad(); } catch(e){}
            } else {
              try { hls.stopLoad(); } catch(e){}
              setTimeout(() => { try { hls.startLoad(); } catch(e){} }, 800);
            }
          }
        };

        const onManifestParsed = () => {
          // Si hay pistas de audio, poblar select
          try {
            if (hls.audioTracks && hls.audioTracks.length > 1) {
              this.populateAudioTracks(hls.audioTracks);
            } else if (this.audioSelectEl) {
              this.audioSelectEl.style.display = 'none';
            }
          } catch(e){}

          // Reproducir
          try { this.videoEl.play().catch(()=>{}); } catch(e){}
          resolve();
        };

        const onAudioUpdated = () => {
          try {
            if (hls.audioTracks && hls.audioTracks.length > 1) {
              this.populateAudioTracks(hls.audioTracks);
            }
          } catch(e){}
        };

        const cleanup = () => {
          try { hls.off(Hls.Events.ERROR, onError); } catch(e){}
          try { hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed); } catch(e){}
          try { hls.off(Hls.Events.AUDIO_TRACKS_UPDATED, onAudioUpdated); } catch(e){}
        };

        hls.on(Hls.Events.ERROR, onError);
        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, onAudioUpdated);

        try {
          hls.loadSource(u);
          hls.attachMedia(this.videoEl);
        } catch (e) {
          cleanup();
          try { hls.destroy(); } catch(e){}
          this.hls = null;
          return reject(e);
        }
      });
    };

    // Intento de convertir manifiesto a blob (para arreglar rutas relativas)
    const fetchManifestToBlobUrl = async (u) => {
      try {
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
      } catch (e) {
        throw e;
      }
    };

    // Watchdog: si no avanza currentTime tras X ms, intentamos recrear el player
    const startWatchdog = (timeoutMs = 6000) => {
      this.stopWatchdog();
      let lastTime = this.videoEl.currentTime;
      this._watchdogTimer = setInterval(() => {
        try {
          if (!this.videoEl.paused && !this.videoEl.ended) {
            const now = this.videoEl.currentTime;
            if (Math.abs(now - lastTime) < 0.01) {
              console.warn('[watchdog] playback stalled, attempting recovery');
              // Acción de recuperación: reload, reattach Hls con worker toggled
              this.attemptRecoverySequence(url).catch(e => console.warn('Recovery failed', e));
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
    this.stopWatchdog = stopWatchdog;
    this.startWatchdog = startWatchdog;

    // Secuencia de intentos (mejorada)
    const attemptSequence = async () => {
      try {
        // 1) Intentar Hls con worker true / startFragPrefetch true
        await tryLoadWithHlsConfig(url, { enableWorker: true, startFragPrefetch: true });
        console.info('[player] Hls (worker:true) OK');
        this.spinnerEl.classList.add("hidden");
        this.videoEl.muted = false; // desmutear si se desea (puedes hacer condicional)
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        this.startWatchdog(7000);
        return;
      } catch (e1) {
        console.warn('[player] Hls(worker:true) failed:', e1);
      }

      try {
        // 2) Intentar Hls con worker false (algunas WebView fallan con workers)
        await tryLoadWithHlsConfig(url, { enableWorker: false, startFragPrefetch: true });
        console.info('[player] Hls (worker:false) OK');
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
        // 3) Usar manifest -> blob -> Hls (ayuda si hay rutas relativas)
        const blobUrl = await fetchManifestToBlobUrl(url);
        try {
          await tryLoadWithHlsConfig(blobUrl, { enableWorker: false, startFragPrefetch: true });
          console.info('[player] Hls via manifest-blob OK');
          URL.revokeObjectURL(blobUrl);
          this.spinnerEl.classList.add("hidden");
          this.videoEl.muted = false;
          this.iconLive.style.color = "red";
          this.stopDvrInterval();
          this.startWatchdog(7000);
          return;
        } catch (e3) {
          console.warn('[player] Hls via blob failed:', e3);
          try { URL.revokeObjectURL(blobUrl); } catch(e){}
        }
      } catch(e) {
        console.warn('[player] fetch manifest->blob failed', e);
      }

      // 4) intentar native (asignar src directo)
      try {
        console.info('[player] trying native fallback');
        tryNativePlay(url);
        // esperar un poco para ver si arranca
        await new Promise(res => setTimeout(res, 1400));
        if (!this.videoEl.paused && !this.videoEl.error) {
          console.info('[player] native fallback OK');
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

      // 5) si hay proxy configurado, intentar con proxy (Hls y native)
      if (this.config && this.config.proxyPrefix) {
        const prox = maybeWithProxy(url);
        try {
          await tryLoadWithHlsConfig(prox, { enableWorker: false, startFragPrefetch: true });
          console.info('[player] Hls via proxy OK');
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
          await new Promise(res => setTimeout(res, 1200));
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

      // 6) último recurso: asignar src directo y dar por perdido
      try {
        tryNativePlay(url);
      } catch(e){
        console.error('[player] all attempts failed finally', e);
      } finally {
        this.spinnerEl.classList.add("hidden");
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
      }
    };

    // Ejecutar la secuencia
    attemptSequence().catch(err => {
      console.error('[player] attemptSequence unhandled error', err);
      this.spinnerEl.classList.add("hidden");
      this.stopDvrInterval();
    });
  }

  // --- prewarmChannel: intenta fetch del manifiesto y primer segmento para "calentar" el origen ---
  async prewarmChannel(index) {
    try {
      const item = this.playlist[index];
      if (!item) return;
      let url = item.file;
      if (!url) return;

      // Si hay proxy configurado, usarlo en la prefetcheo (opcional)
      const pref = (this.config && this.config.proxyPrefix) ? this.config.proxyPrefix.trim() : '';
      const urlToFetch = pref ? pref + url : url;

      console.info('[player] prewarm: fetching manifest for', urlToFetch);
      const resp = await fetch(urlToFetch, {cache:'no-store'});
      if (!resp.ok) throw new Error('manifest HTTP ' + resp.status);
      const text = await resp.text();

      // tomar el primer segmento que no sea comentario
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let candidate = null;
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (L.startsWith('#')) continue;
        // si es url relativa, transformar
        if (!/^https?:\/\//i.test(L)) {
          const base = url.replace(/\/[^\/]*$/, '/');
          candidate = base + L;
        } else candidate = L;
        if (candidate) break;
      }

      if (candidate) {
        const segUrl = pref ? (pref + candidate) : candidate;
        console.info('[player] prewarm: fetching first segment ->', segUrl);
        // petición rápida (no-credentials) para cachear en red/proxy
        await fetch(segUrl, { method: 'GET', mode: 'cors', cache: 'no-store' });
      }
      // si todo ok, devuelve true
      return true;
    } catch (e) {
      console.warn('[player] prewarm failed:', e);
      return false;
    }
  }

  // populateAudioTracks: mejora para mostrar y cambiar pistas
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

  // Monitor playback simple (congelamientos a largo plazo)
  monitorPlayback() {
    let last = 0;
    setInterval(() => {
      if (!this.videoEl.paused && !this.videoEl.ended) {
        if (this.videoEl.currentTime === last) {
          // Puede que haya un freeze, intentar recovery leve
          console.warn('[monitor] detected no-progress, calling playCurrent() to try recover');
          this.playCurrent();
        }
        last = this.videoEl.currentTime;
      }
    }, 8000);
  }

  // ---------------- eventos globales ----------------------
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

  // touch drag (igual que antes)
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

  // DVR
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

  // función pública simple para reintentar manualmente (útil para debugging)
  attemptRecoverySequence(url) {
    return new Promise(async (resolve, reject) => {
      try {
        // destruir hls actual
        if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
        // pequeña pausa
        await new Promise(r => setTimeout(r, 500));
        // intentar recargar con Hls disable worker (segunda opción)
        try {
          await this.playCurrent(); // playCurrent ya contiene su propia lógica de retries
          resolve();
        } catch(e) {
          reject(e);
        }
      } catch(e) { reject(e); }
    });
  }
}

// ------------------ bootstrap: cargar playlist.json -------------------
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
