class PlayerJS {
  constructor() {
    // Elementos básicos del reproductor
    this.videoEl      = document.getElementById("player-video");
    this.playlistEl   = document.getElementById("carouselList");
    this.containerEl  = document.getElementById("playlist-container");
    this.spinnerEl    = document.getElementById("video-loading-spinner");

    // Elementos del Menú TV
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

    // Elementos DVR (barra de progreso)
    this.dvrContainer = document.getElementById("dvr-container");
    this.dvrProgress  = document.getElementById("dvr-progress");
    this.dvrKnob      = document.getElementById("dvr-knob");

    this.overlayActive = false;
    this.menuTimer     = null;
    this.dvrInterval   = null;  // temporizador para actualizar la barra de progreso

    // Índices y flags para playlist
    this.currentIndex      = 0;
    this.playbackIndex     = 0;
    this.hasUncommittedNav = false;

    // Playlist y reproductores (HLS / Shaka)
    this.playlist      = [];
    this.hls           = null;
    this.shakaPlayer   = null;

    // Integración audio selector (player2.js -> AudioSelector)
    // Mantener referencia para no reinicializar múltiples veces
    this.audioSelectorApi = null;

    // Auto‐hide playlist
    this.lastNavTime   = Date.now();
    this.autoHide      = 5000;

    // Configuración del carrusel
    this.visibleCount  = 7;
    this.half          = Math.floor(this.visibleCount / 2);

    // Touch‐drag
    this._touchStartY  = 0;
    this._isDragging   = false;

    this.init();
  }

  init() {
    // Reloj del menú (se actualiza cada minuto)
    this.updateClock();
    setInterval(() => this.updateClock(), 60000);

    this.addUIListeners();
    this.initMenuActions();
    this.videoEl.autoplay = true;
    // Intento de asegurar audio no en mute (si el navegador/TV lo permite)
    try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e) {}
    this.monitorPlayback();

    // Auto‐hide SOLO para playlist
    setInterval(() => {
      if (!this.overlayActive &&
          Date.now() - this.lastNavTime > this.autoHide) {
        this.hideUI();
      }
    }, 500);

    this.initTouchDrag();
  }

  /**
   * Actualiza el reloj HH:MM (formato 12h sin AM/PM).
   */
  updateClock() {
    const d = new Date();
    let h = d.getHours() % 12 || 12;
    let m = String(d.getMinutes()).padStart(2, "0");
    this.timeEl.textContent = `${h}:${m}`;
  }

  /*──────────────────────────────────────────────────────────*/
  /*                     MENU TV (DVR)                       */
  /*──────────────────────────────────────────────────────────*/
  initMenuActions() {
    // 1) Volver → history.back()
    this.btnReturn.addEventListener("click", () => history.back());

    // 2) Canales → mostrar playlist
    this.btnList.addEventListener("click", () => {
      this.hideMenu();
      this.showUI();
    });

    // 3) Pausa / Reanudar, activa modo DVR
    this.btnPause.addEventListener("click", () => {
      if (this.videoEl.paused) {
        // Si estaba pausado, reanuda al vivo
        this.videoEl.play();
        this.iconPause.className = "bi bi-pause-circle-fill";
        this.btnPause.dataset.title = "Pausa";

        // Botón "En Vivo" vuelve al color rojo
        this.iconLive.style.color = "red";

        // Detener actualización del DVR
        this.stopDvrInterval();
      } else {
        // Si estaba reproduciendo, pausar y entrar en modo DVR
        this.videoEl.pause();
        this.iconPause.className = "bi bi-play-circle-fill";
        this.btnPause.dataset.title = "Reanudar";

        // Botón "En Vivo" se pone gris
        this.iconLive.style.color = "gray";

        // Iniciar actualización del DVR cada 500ms
        this.startDvrInterval();
      }
      this.resetMenuTimer();
    });

    // 4) En Vivo → saltar al final del buffer y reproducir
    this.btnLive.addEventListener("click", () => {
      const buf = this.videoEl.buffered;
      if (buf.length > 0) {
        const livePoint = buf.end(buf.length - 1);
        this.videoEl.currentTime = livePoint;
      }
      this.videoEl.play();
      // Asegurar icono Pause y Live en estado "vivo"
      this.iconPause.className = "bi bi-pause-circle-fill";
      this.btnPause.dataset.title = "Pausa";
      this.iconLive.style.color = "red";
      this.stopDvrInterval();
      this.resetMenuTimer();
    });

    // 5) Cerrar overlay
    this.btnClose.addEventListener("click", () => this.hideMenu());

    // Tooltip sobre cada botón cuando reciba foco
    [
      this.btnReturn,
      this.btnList,
      this.btnPause,
      this.btnLive,
      this.btnClose
    ].forEach(btn => {
      btn.addEventListener("focus", () => this.showTooltip(btn));
    });
  }

  /**
   * Muestra el menú: oculta el playlist, actualiza miniatura,
   * número de canal, calidad, y coloca el foco en “Volver”.
   */
  showMenu() {
    this.overlayActive = true;
    // Ocultar playlist
    this.containerEl.classList.remove("active");

    // Update thumbnail, channel number & quality
    const cur = this.playlist[this.playbackIndex] || {};
    this.imgEl.src            = cur.image || "";
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

  /*──────────────────────────────────────────────────────────*/
  /*                   PLAYLIST UI (oculto al inicio)        */
  /*──────────────────────────────────────────────────────────*/
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
    // No llamamos a showUI() aquí: playlist permanece oculto al cargar
    this.playCurrent();
  }

  /*──────────────────────────────────────────────────────────*/
  /*                  CARRUSEL LOGIC                         */
  /*──────────────────────────────────────────────────────────*/
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
    const itemH = items[0].offsetHeight
                + parseFloat(st.marginTop)
                + parseFloat(st.marginBottom);
    const wrapH = this.containerEl
                   .querySelector(".carousel-wrapper").clientHeight;
    const baseY = wrapH / 2 - itemH / 2 - this.half * itemH;

    this.playlistEl.style.transition = animate
      ? "transform .3s ease"
      : "none";
    this.playlistEl.style.transform = `translateY(${baseY}px)`;

    Array.from(items).forEach((el, i) => {
      el.classList.toggle("focused", i === this.half);
    });

    if (!animate) {
      void this.playlistEl.offsetWidth;
      this.playlistEl.style.transition = "transform .3s ease";
    }
  }

  move(dir) {
    const N = this.playlist.length;
    this.currentIndex = (this.currentIndex + dir + N) % N;
    this.hasUncommittedNav = true;
    this.lastNavTime = Date.now();
    this.renderCarousel();
    this.updateCarousel(true);
  }

  /*──────────────────────────────────────────────────────────*/
  /*                REPRODUCCIÓN & DVR LOGIC                */
  /*──────────────────────────────────────────────────────────*/
  playCurrent() {
    const f = this.playlist[this.currentIndex] || {};
    this.playbackIndex     = this.currentIndex;
    this.hasUncommittedNav = false;

    // Destruir instancias previas
    if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
    if (this.shakaPlayer) { try { this.shakaPlayer.destroy(); } catch(e){} this.shakaPlayer = null; }

    const url = (f.file || "").trim();
    // Detectar robustamente .m3u8 (http, parámetros, mayúsculas/minúsculas)
    const isM3U8 = /\.m3u8($|\?)/i.test(url);

    // Mostrar spinner mientras cargamos
    this.spinnerEl.classList.remove("hidden");

    if (isM3U8) {
      // --- Primero: Si Hls.js está disponible y soportado, usarlo con manejadores robustos ---
      if (window.Hls && Hls.isSupported()) {
        // Crear Hls con configuración que ayuda en dispositivos TV
        try {
          this.hls = new Hls({
            maxBufferLength: 30,
            liveSyncDurationCount: 3,
            enableWorker: true,
            // xhrSetup nos permite controlar XHR (por ejemplo withCredentials)
            xhrSetup: (xhr, resource, url) => {
              try {
                // No forzamos withCredentials por defecto, pero dejamos la opción
                xhr.withCredentials = false;
                // Nota: no todos los headers/Referer pueden ser establecidos por seguridad del navegador
              } catch (e) {}
            }
          });
        } catch (err) {
          console.warn("Hls init failed, fallbacking to native:", err);
          this.hls = null;
        }

        if (this.hls) {
          // Contador de intentos de recuperación antes de fallback final
          let recoverAttempts = 0;
          const maxRecoverAttempts = 3;
          const self = this;

          // --- INTEGRACIÓN: inicializar AudioSelector (si existe) y pasarle la instancia Hls ---
          try {
            if (window.AudioSelector) {
              // Si no lo hemos inicializado aún, lo hacemos (si ya existe, solo adjuntamos)
              if (!this.audioSelectorApi) {
                // Si no hay un select en el DOM con id 'audio-select', AudioSelector.init creará uno y lo adjuntará.
                this.audioSelectorApi = AudioSelector.init({ video: this.videoEl, audioSelect: '#audio-select', hls: this.hls });
              } else {
                // adjuntar la instancia hls para que AudioSelector pueda leer pistas y exponer UI
                try { this.audioSelectorApi.attachHlsInstance(this.hls); } catch(e) { console.warn('attachHlsInstance failed', e); }
              }
            }
          } catch(e) {
            console.warn('AudioSelector integration failed (non-fatal):', e);
          }

          // Manejar eventos de errores de Hls.js
          this.hls.on(Hls.Events.ERROR, function(event, data) {
            console.warn("Hls error event:", data);
            // Si el error es fatal, intentar recuperar según tipo
            if (data && data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                // Intento de reanudar descarga
                try {
                  console.warn("Hls: network error -> startLoad()");
                  self.hls.startLoad();
                } catch (e) {
                  console.error("Hls startLoad failed", e);
                }
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                try {
                  console.warn("Hls: media error -> recoverMediaError()");
                  self.hls.recoverMediaError();
                } catch (e) {
                  console.error("Hls recover failed", e);
                }
              } else {
                // Otros errores: intentar reiniciar la carga algunas veces
                if (recoverAttempts < maxRecoverAttempts) {
                  recoverAttempts++;
                  console.warn(`Hls: unrecoverable error, retry ${recoverAttempts}/${maxRecoverAttempts}`);
                  try {
                    self.hls.stopLoad();
                    // Espera breve antes de reiniciar
                    setTimeout(() => {
                      try { self.hls.startLoad(); } catch(e) { console.error(e); }
                    }, 800);
                  } catch (e) {
                    console.error(e);
                  }
                } else {
                  // Si se alcanzaron múltiples intentos, fallback a reproducción nativa
                  console.warn("Hls: multiple failures, fallback to native video src");
                  try {
                    self.hls.destroy();
                  } catch (e) {}
                  self.hls = null;
                  // Fallback: asignar directamente al <video> (algunos motores nativos pueden reproducir)
                  try {
                    self.videoEl.src = url;
                    // Asegurar que el video intente reproducir y audio no quede en mute
                    try { self.videoEl.muted = false; self.videoEl.volume = 1; } catch(e) {}
                    self.videoEl.play().catch(err => {
                      console.error("Fallback native play failed", err);
                    });
                  } finally {
                    self.spinnerEl.classList.add("hidden");
                  }
                }
              }
            }
          });

          // Cuando el manifiesto esté parseado, reproducir
          this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Intentar asegurar audio en caso de políticas de autoplay
            try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e) {}
            // Ocultar spinner y reproducir
            try { this.videoEl.play().catch(()=>{}); } catch(e){}
            this.spinnerEl.classList.add("hidden");
            // Si AudioSelector está inicializado, dejar que detecte pistas (ya le pasamos this.hls)
            try {
              if (this.audioSelectorApi && this.hls) {
                try { this.audioSelectorApi.attachHlsInstance(this.hls); } catch(e) {}
              }
            } catch(e){}
          });

          // Intento de carga
          try {
            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoEl);
          } catch (err) {
            console.warn("Hls load/attach threw:", err);
            try {
              this.hls.destroy();
            } catch (e) {}
            this.hls = null;
            // Intentar reproducción nativa como último recurso
            try {
              this.videoEl.src = url;
              try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e) {}
              this.videoEl.play().catch(()=>{});
            } finally {
              this.spinnerEl.classList.add("hidden");
            }
          }

          // Devolver (hemos delegado la reproducción a Hls.js)
          this.videoEl.title = f.title || "";
          this.iconLive.style.color = "red";
          this.stopDvrInterval();
          return;
        }
      }

      // --- Si Hls.js no está disponible o no fue posible inicializarlo ---
      // Verificar soporte nativo HLS (Safari y algunos motores que exponen MIME)
      if (this.videoEl.canPlayType && this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        try {
          this.videoEl.src = url;
          // Inicializar AudioSelector para HLS nativo (detecta audioTracks)
          try {
            if (window.AudioSelector) {
              if (!this.audioSelectorApi) {
                this.audioSelectorApi = AudioSelector.init({ video: this.videoEl, audioSelect: '#audio-select' });
              } else {
                // no hay instancia hls, pero AudioSelector ya hará polling sobre audioTracks nativos
              }
            }
          } catch(e){ console.warn('AudioSelector native init failed', e); }

          this.videoEl.addEventListener('loadedmetadata', () => {
            try { this.videoEl.play().catch(()=>{}); } catch(e){}
            // asegurar audio
            try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e){}
            this.spinnerEl.classList.add("hidden");
          }, { once: true });
        } catch (e) {
          console.warn("Native HLS attempt failed:", e);
          // último recurso: asignar y call play
          try { this.videoEl.src = url; this.videoEl.play().catch(()=>{}); } catch(e){}
          this.spinnerEl.classList.add("hidden");
        }

        this.videoEl.title = f.title || "";
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        return;
      }

      // --- Fallback final: si no hay Hls.js ni soporte nativo, usar shaka o asignar src directo ---
      if (window.shaka && shaka.Player.isBrowserSupported()) {
        try {
          this.shakaPlayer = new shaka.Player(this.videoEl);
          // Integración AudioSelector con Shaka: AudioSelector por defecto hace polling nativo,
          // si tu Shaka expone API adicional podríamos integrarla aquí.
          this.shakaPlayer.load(url)
            .then(() => {
              try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e){}
              this.videoEl.play().catch(()=>{}); this.spinnerEl.classList.add("hidden");
            })
            .catch(err => {
              console.warn("Shaka load failed, fallback to direct src", err);
              try { this.videoEl.src = url; this.videoEl.play().catch(()=>{}); } catch(e){}
              this.spinnerEl.classList.add("hidden");
            });
          this.videoEl.title = f.title || "";
          this.iconLive.style.color = "red";
          this.stopDvrInterval();
          return;
        } catch (e) {
          console.warn("Shaka initialization failed:", e);
          this.shakaPlayer = null;
        }
      }

      // Último recurso: asignar al src del <video> (funciona en algunos entornos/Chrome)
      try {
        this.videoEl.src = url;
        try { this.videoEl.muted = false; this.videoEl.volume = 1; } catch(e){}
        this.videoEl.play().catch(()=>{});
      } catch (e) {
        console.error("Final fallback assignment failed:", e);
      } finally {
        this.videoEl.title = f.title || "";
        this.iconLive.style.color = "red";
        this.stopDvrInterval();
        this.spinnerEl.classList.add("hidden");
      }
    }
    else {
      // No es .m3u8 → usar Shaka si está o fallback directo
      if (window.shaka && shaka.Player.isBrowserSupported()) {
        this.shakaPlayer = new shaka.Player(this.videoEl);
        this.shakaPlayer.load(url)
          .then(() => this.videoEl.play())
          .catch(() => {
            this.videoEl.src = url;
            this.videoEl.play();
          });
      }
      else {
        // Fallback HTML5 <video> para MP4 o .m3u8 no soportados
        this.videoEl.src = url;
        this.videoEl.play();
      }
      this.videoEl.title = f.title || "";

      // Cuando cambia de canal, el botón "En Vivo" vuelve a rojo y se detiene DVR
      this.iconLive.style.color = "red";
      this.stopDvrInterval();
      this.spinnerEl.classList.add("hidden");
    }
  }

  play() {
    this.playCurrent();
    this.renderCarousel();
    this.updateCarousel(true);
  }

  monitorPlayback() {
    let last = 0;
    setInterval(() => {
      if (!this.videoEl.paused && !this.videoEl.ended) {
        if (this.videoEl.currentTime === last) {
          // Si se congela, reintenta reproducir
          this.playCurrent();
        }
        last = this.videoEl.currentTime;
      }
    }, 5000);
  }

  /*──────────────────────────────────────────────────────────*/
  /*            EVENTOS GLOBALES (Teclado / Rueda)            */
  /*──────────────────────────────────────────────────────────*/
  addUIListeners() {
    ["mousemove","click","touchstart"].forEach(ev =>
      window.addEventListener(ev, () => this.showUI())
    );

    window.addEventListener("keydown", e => {
      const key = e.key;
      const code = e.keyCode;

      // Prevenir scroll nativo
      if ([
        "ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter",
        "MediaPlayPause","Pause"," " /*Space*/, "ChannelUp","ChannelDown"
      ].includes(key) || [32,179,33,34].includes(code)) {
        e.preventDefault();
      }

      // Mapeo para botón especial de “Pause/Resume” del control remoto:
      if (key === "MediaPlayPause" || key === "Pause" || code === 179) {
        // Disparar la misma lógica que btnPause.click()
        this.btnPause.click();
        return;
      }

      // Cambio de canal con ChannelUp (código 33) / ChannelDown (código 34)
      if (key === "ChannelUp" || code === 33) {
        this.move(-1);
        this.playCurrent();
        return;
      }
      if (key === "ChannelDown" || code === 34) {
        this.move(1);
        this.playCurrent();
        return;
      }

      // Si el overlay está activo, navegación entre sus botones
      if (this.overlayActive) {
        if (key === "ArrowLeft") {
          if (document.activeElement === this.btnList)    this.btnReturn.focus();
          else if (document.activeElement === this.btnPause) this.btnList.focus();
          else if (document.activeElement === this.btnLive)  this.btnPause.focus();
          else if (document.activeElement === this.btnClose) this.btnLive.focus();
        }
        else if (key === "ArrowRight") {
          if (document.activeElement === this.btnReturn) this.btnList.focus();
          else if (document.activeElement === this.btnList) this.btnPause.focus();
          else if (document.activeElement === this.btnPause) this.btnLive.focus();
          else if (document.activeElement === this.btnLive)  this.btnClose.focus();
        }
        else if (key === "Enter") {
          document.activeElement.click();
        }
        this.resetMenuTimer();
        return;
      }

      // Flecha izquierda fuera del overlay → abre menú
      if (key === "ArrowLeft") {
        this.showMenu();
        return;
      }

      // Flechas arriba/abajo fuera del overlay → muestra playlist si oculto
      if (!this.containerEl.classList.contains("active")
          && (key === "ArrowUp" || key === "ArrowDown")) {
        this.showUI();
        return;
      }

      // Navegación del playlist
      if (key === "ArrowUp")        this.move(-1);
      else if (key === "ArrowDown") this.move(1);
      else if (key === "Enter")     this.playCurrent();
    });

    // Rueda global para playlist
    window.addEventListener("wheel", e => {
      e.preventDefault();
      if (this.overlayActive) return;
      if (!this.containerEl.classList.contains("active")) {
        this.showUI();
      } else {
        this.move(e.deltaY > 0 ? 1 : -1);
      }
    });

    // Spinner + retry on error
    this.videoEl.addEventListener("waiting", () =>
      this.spinnerEl.classList.remove("hidden")
    );
    this.videoEl.addEventListener("playing", () =>
      this.spinnerEl.classList.add("hidden")
    );
    this.videoEl.addEventListener("error", () =>
      this.playCurrent()
    );
  }

  /*──────────────────────────────────────────────────────────*/
  /*               TOUCH‐DRAG EN EL PLAYLIST                  */
  /*──────────────────────────────────────────────────────────*/
  initTouchDrag() {
    const wrapper = this.containerEl.querySelector(".carousel-wrapper");
    const listEl  = this.playlistEl;
    let itemH, baseY;

    const recalc = () => {
      const first = listEl.children[0];
      const st = getComputedStyle(first);
      itemH = first.offsetHeight
            + parseFloat(st.marginTop)
            + parseFloat(st.marginBottom);
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

  /*──────────────────────────────────────────────────────────────────*/
  /*                 DVR – Actualizar la Barra de Progreso            */
  /*──────────────────────────────────────────────────────────────────*/
  startDvrInterval() {
    // Actualizar cada 500 ms
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
          if (ratio < 0) ratio = 0;
          if (ratio > 1) ratio = 1;
          this.dvrProgress.style.width = `${Math.floor(ratio * 100)}%`;
          // Mover el knob
          const containerWidth = this.dvrContainer.clientWidth;
          const knobX = ratio * containerWidth;
          this.dvrKnob.style.transform = `translateX(${knobX}px)`;
        }
      }
    }, 500);
  }

  stopDvrInterval() {
    if (this.dvrInterval) {
      clearInterval(this.dvrInterval);
      this.dvrInterval = null;
      // Reset de la barra (opcional)
      // this.dvrProgress.style.width = "0%";
      // this.dvrKnob.style.transform = "translateX(0px)";
    }
  }
}

// Arranque

// Arranque
document.addEventListener("DOMContentLoaded", () => {
  const player = new PlayerJS();
  player.loadPlaylist([
    {
      number: "100",
      image: "img/canallatina.png",
      title: "LATINA",
      file:
        "https://jireh-3-hls-video-pe-isp.dps.live/hls-video/567ffde3fa319fadf3419efda25619456231dfea/latina/latina.smil/latina/livestream2/chunks.m3u8"
    },
    {
      number: "101",
      image: "img/CANAL-AUTENTICA.png",
      title: "AUTENTICA",
      file: "https://live.obslivestream.com/autenticatvmux/index.m3u8"
    },
    {
      number: "102",
      image: "img/CANAL-COPS.png",
      title: "COPS",
      file: "https://rightsboosterltd-cops-1-es.rakuten.wurl.tv/playlist.m3u8"
    },
    {
      number: "103",
      image: "img/CANAL-DODO.png",
      title: "DODO TV",
      file: "https://cloud5.streaminglivehd.com:3651/hybrid/play.m3u8"
    },
    {
      number: "104",
      image: "img/canalneotv.png",
      title: "NEO TV",
      file: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8"
    },
    {
      number: "105",
      image: "img/canalplanetatv.png",
      title: "PLANETA",
      file: "https://live.obslivestream.com/planetatv/index.m3u8"
    },
    {
      number: "106",
      image: "img/CANAL-AMC.png",
      title: "AMC",
      file: "https://amc-amcespanol-1-us.lg.wurl.tv/playlist.m3u8"
    },
    {
      number: "107",
      image: "img/canalwowtv.png",
      title: "WOW TV",
      file:
        "https://cdn.elsalvadordigital.com:1936/wowtv/smil:wowtv.smil/playlist.m3u8"
    },
    {
      number: "108",
      image: "img/canalcocotv.png",
      title: "COCO TV",
      file:
        "https://cloudflare.streamgato.us:3253/live/canalcocotvlive.m3u8"
    },
    {
      number: "109",
      image: "img/canalsoltv.png",
      title: "SOL TV",
      file:
        "https://cdn.streamhispanatv.net:3409/live/soltvlive.m3u8"
    },
    {
      number: "110",
      image: "img/CANAL-AFV.png",
      title: "AFV TV",
      file:
        "https://linear-46.frequency.stream/dist/plex/46/hls/master/playlist.m3u8"
    },
    {
      number: "111",
      image: "img/canalsonynovelas.png",
      title: "SONY NOVELAS",
      file:
        "https://a89829b8dca2471ab52ea9a57bc28a35.mediatailor.us-east-1.amazonaws.com/v1/master/0fb304b2320b25f067414d481a779b77db81760d/CanelaTV_SonyCanalNovelas/playlist.m3u8"
    },
    {
      number: "112",
      image: "img/canaldw.png",
      title: "DW ESPAÑOL",
      file:
        "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8"
    },
    {
      number: "113",
      image: "img/CANAL-CINECANAL.png",
      title: "CINECANAL",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/CINECANAL/index.m3u8"
    },
    {
      number: "114",
      image: "img/CANAL57.png",
      title: "CANAL 57",
      file: "https://167790.global.ssl.fastly.net/6189746bccf0424c112f5476/live_50bbca50292011ed8d265962bedee5f9/tracks-v2a1/mono.m3u8"
    },
    {
      number: "115",
      image: "img/CANAL-ESTRELLAS.png",
      title: "LAS ESTRELLAS",
      file:
        "https://channel01-onlymex.akamaized.net/hls/live/2022749/event01/index.m3u8"
    },
    {
      number: "116",
      image: "img/CANAL-INFAST.png",
      title: "INFAST",
      file: "https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg00861-terninternation-lifestylelatam-lges/playlist.m3u8"
    },
    {
      number: "117",
      image: "img/CANAL-TELEMUNDO.png",
      title: "TELEMUNDO",
      file:
        "https://nbculocallive.akamaized.net/hls/live/2037499/puertorico/stream1/master.m3u8"
    },
    {
      number: "118",
      image: "img/CANAL-CTV.png",
      title: "CTV INTERNCIONAL",
      file:
        "https://mediacp.us:8081/ctvhn/index.m3u8"
    },
    {
      number: "119",
      image: "img/CANAL-SONYCOMEDY.png",
      title: "SONY COMEDIA",
      file: "https://spt-sonyonecomedias-mx.xiaomi.wurl.tv/playlist.m3u8"
    }
    ,
    {
      number: "120",
      image: "img/CANAL-FMCOSMOS.png",
      title: "COSMOS TV",
      file:
        "https://tv.mediacp.eu:19360/cosmos/cosmos.m3u8"
    },
    {
      number: "121",
      image: "img/CANAL-SONY.png",
      title: "SONY CINE",
      file:
        "https://a-cdn.klowdtv.com/live1/cine_720p/playlist.m3u8"
    }
    ,
    {
      number: "122",
      image: "img/CANAL-TELEMUNDOACCION.png",
      title: "ACCIÓN",
      file:
        "https://xumo-drct-ch835-ekq0p.fast.nbcuni.com/live/master.m3u8"
    }
    ,
    {
      number: "123",
      image: "img/CANAL-MEGACINE.png",
      title: "MEGA CINE TV",
      file:
        "https://cnn.hostlagarto.com/megacinetv/index.m3u8"
    }
    ,
    {
      number: "124",
      image: "img/CANAL-DMJ.png",
      title: "DMJ",
      file:
        "https://stmv1.voxhdnet.com/dmjsurtv/dmjsurtv/playlist.m3u8"
    }
    ,
    {
      number: "125",
      image: "img/CANAL-H2.png",
      title: "HISTORY 2",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/HISTORY2/index.m3u8"
    }
    ,
    {
      number: "126",
      image: "img/CANAL-PALMERASTV.png",
      title: "PALMERAS TV",
      file:
        "https://play.agenciastreaming.com:8081/palmerastv/index.m3u8"
    }
    ,
    {
      number: "127",
      image: "img/CANAL-MEGATV.png",
      title: "MEGA TV",
      file:
        "https://mc.servidor.stream:19360/megatv/megatv.m3u8"
    }
    ,
    {
      number: "128",
      image: "img/CANAL-AMERICATV.png",
      title: "AMERICA TV",
      file:
        "https://live-evg1.tv360.bitel.com.pe/bitel/americatv/playlist.m3u8"
    }
    ,
    {
      number: "129",
      image: "img/CANAL ATV.png",
      title: "ATV",
      file:
        "https://alba-pe-atv-atv.stream.mediatiquestream.com/index.m3u8"
    },
    {
      number: "130",
      image: "img/CANAL-SONYCHANNEL.png",
      title: "SONY CHANNEL",
      file:
        "http://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/stitch/hls/channel/5d8d08395f39465da6fb3ec4/master.m3u8?appName=web&appVersion=unknown&clientTime=0&deviceDNT=0&deviceId=6c2a5107-30d3-11ef-9cf5-e9ddff8ff496&deviceMake=Chrome&deviceModel=web&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=919bc5fd-6cce-44a6-bb39-2894dea1c988"
    }
    ,
    {
      number: "131",
      image: "img/CANAL-SOLTVTRUJILLO.png",
      title: "SOL TV",
      file:
        "https://video03.logicahost.com.br/soltv/soltv/chunklist_w149003240.m3u8"
    },
    {
      number: "132",
      image: "img/CANAL-STUDIOUNIVERSAL.png",
      title: "STUDIO UNIVERSAL",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/STUDIO_UNIVERSAL/index.m3u8"
    }
  ]);
});