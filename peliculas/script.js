// script.js (plantilla) - player con controles minimalistas, auto-hide legend/title/age, D-pad navigation y guardado de progreso en IndexedDB (SOLO IDB)
(() => {
  const JSON_PATHS = ["./moviebase.json", "../moviebase.json", "/moviebase.json"];
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@latest";

  const $ = (s) => document.querySelector(s);
  const $id = (id) => document.getElementById(id);

  // --- Utilidades ---
  function formatTime(s) {
    if (!isFinite(s) || s <= 0) return "00:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function ajustarPuntuacion(val) {
    if (val >= 4.9) return 5;
    if (val >= 4.5) return 4.5;
    if (val >= 4.0) return 4;
    if (val >= 3.5) return 3.5;
    if (val >= 3.0) return 3;
    if (val >= 2.5) return 2.5;
    if (val >= 2.0) return 2;
    if (val >= 1.5) return 1.5;
    if (val >= 1.0) return 1;
    return 0.5;
  }

  function crearEstrellas(container, puntuacion) {
    if (!container) return;
    container.innerHTML = "";
    const p = ajustarPuntuacion(Number(puntuacion) || 0);
    const completas = Math.floor(p);
    const tieneMedia = p - completas >= 0.5;
    for (let i = 0; i < completas; i++) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star"); container.appendChild(ico);
    }
    if (tieneMedia) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-half-outline"); container.appendChild(ico);
    }
    const vacias = 5 - completas - (tieneMedia ? 1 : 0);
    for (let i = 0; i < vacias; i++) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-outline"); container.appendChild(ico);
    }
  }

  function okToEmbed(url) {
    if (!url) return "";
    try {
      if (url.includes("ok.ru") && url.includes("videoembed")) return url.startsWith("//") ? url : url.replace(/^https?:/, "");
      const m = url.match(/(\d{6,})/);
      if (m) return `//ok.ru/videoembed/${m[1]}?nochat=1&autoplay=1`;
      if (url.includes("ok.ru")) return url.startsWith("//") ? url : url.replace(/^https?:/, "");
      return url;
    } catch (e) {
      return url;
    }
  }

  // --- MovieBase fetch ---
  async function fetchMovieBase() {
    for (const p of JSON_PATHS) {
      try {
        const r = await fetch(p, { cache: "no-store" });
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j)) return j;
      } catch (e) { /* ignore */ }
    }
    console.warn("moviebase.json no encontrado en rutas probadas:", JSON_PATHS);
    return null;
  }

  // --- Player core ---
  let _hlsInstance = null;
  const _state = { playing: false, paused: false, src: "", type: "" };

  // Configurables públicos (defaults)
  let CONTROLS_HIDE_MS = 5000; // 5 segundos por defecto
  let FOCUS_RING_COLOR = "rgba(138,88,194,0.28)"; // color por defecto

  // Control visibility / inactivity vars
  let controlsHideTimer = null;
  let controlsVisible = true;
  let keepControlsVisible = false; // <- BANDERA: cuando true, no se auto-ocultan los controles

  // Progress saving vars
  let _progressAutoSaveInterval = null; // interval id
  const AUTO_SAVE_INTERVAL_MS = 5000; // cada 5s guardamos progreso
  const PROGRESS_MIN_SECONDS = 5; // umbral mínimo para guardar
  const FINISHED_PCT = 96; // >= 96% => considerado visto
  const CLEANUP_MS = 2 * 24 * 60 * 60 * 1000; // 2 días en ms

  // ----------------------
  // IndexedDB helpers (solo IDB)
  // ----------------------
  function idbOpen() {
    return new Promise((res, rej) => {
      try {
        const req = indexedDB.open("movie_progress_db", 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("progress")) {
            db.createObjectStore("progress", { keyPath: "id" });
          }
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      } catch (e) {
        rej(e);
      }
    });
  }

  async function idbGet(id) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction("progress", "readonly");
        const store = tx.objectStore("progress");
        const r = store.get(String(id));
        r.onsuccess = () => { res(r.result || null); db.close(); };
        r.onerror = () => { rej(r.error); db.close(); };
      });
    } catch (e) {
      return null;
    }
  }

  async function idbSet(record) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction("progress", "readwrite");
        const store = tx.objectStore("progress");
        const r = store.put(record);
        r.onsuccess = () => { res(true); db.close(); };
        r.onerror = () => { rej(r.error); db.close(); };
      });
    } catch (e) {
      throw e;
    }
  }

  async function idbDelete(id) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction("progress", "readwrite");
        const store = tx.objectStore("progress");
        const r = store.delete(String(id));
        r.onsuccess = () => { res(true); db.close(); };
        r.onerror = () => { rej(r.error); db.close(); };
      });
    } catch (e) {
      return false;
    }
  }

  // public/save helpers (SOLO IDB)
  async function saveProgress(id, timeSec, durationSec) {
    if (!id) return false;
    const payload = {
      id: String(id),
      time: Number(timeSec) || 0,
      duration: Number(durationSec) || 0,
      updated: Date.now()
    };
    // Solo IDB: si falla, lanzamos/logueamos
    try {
      await idbSet(payload);
      return true;
    } catch (e) {
      console.warn("saveProgress (IndexedDB) error:", e);
      return false;
    }
  }

  async function getProgress(id) {
    if (!id) return null;
    try {
      const rec = await idbGet(id);
      return rec;
    } catch (e) {
      console.warn("getProgress (IndexedDB) error:", e);
      return null;
    }
  }

  async function deleteProgress(id) {
    try { await idbDelete(id); return true; } catch(e) { return false; }
  }

  // try request persistent storage (best-effort)
  (async function tryRequestPersistent() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        console.info("storage.persist()", granted);
      }
    } catch (e) { /* ignore */ }
  })();

  // ----------------------
  // UI inject / overlay
  // ----------------------
  function injectOverlayHtml() {
    if ($("#player-overlay")) return;

    const style = document.createElement("style");
    style.id = "player-overlay-styles";
    style.textContent = `
      :root { --player-focus-color: ${FOCUS_RING_COLOR}; }
      #player-overlay{ display:none; position:fixed; inset:0; z-index:99999; align-items:center; justify-content:center; background:rgba(0,0,0,0.92); transition:opacity .35s ease; }
      #player-overlay.show{ display:flex; opacity:1; pointer-events:auto; }
      #player-overlay.hide{ opacity:0; pointer-events:none; }
      #player-overlay .player-wrap{ width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; }
      #player-overlay video{ width:100%; height:100%; max-height:100vh; object-fit:contain; background:#000; outline:none; }
      /* subí el contenedor de controles: bottom aumentado (antes 24px) */
      #player-controls{ position: absolute; bottom: 64px; left:50%; transform:translateX(-50%); display:flex; gap:10px; align-items:center; padding:8px 12px; backdrop-filter: blur(6px); background: rgba(0,0,0,0.25); border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); z-index:100010; max-width:90%; transition: opacity .28s ease, transform .28s ease; }
      #player-controls.controls-hidden{ opacity: 0; transform: translateY(12px) scale(.99); pointer-events: none; }
      #player-controls button{ background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border: none; color: #fff; padding:10px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; min-width:48px; height:48px; cursor:pointer; transition:transform .12s ease, background .12s; }
      #player-controls button:focus{ transform: scale(1.06); box-shadow: 0 6px 18px rgba(0,0,0,0.5), 0 0 0 6px var(--player-focus-color); outline:none; }
      #player-controls button:hover{ transform: translateY(-3px); }
      #ctrl-progress{ -webkit-appearance:none; appearance:none; width:320px; height:6px; border-radius:999px; background:rgba(255,255,255,0.15); pointer-events:none; }
      #ctrl-progress::-webkit-slider-thumb{ -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); pointer-events:none; }
      #ctrl-time{ color:#ddd; font-size:0.9rem; min-width:98px; text-align:right; margin-left:6px; }
      #center-pause{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:100020; display:none; align-items:center; justify-content:center; }
      #center-pause.show{ display:flex; animation: pop .28s ease; }
      #player-legend{ position:absolute; left:18px; bottom:18px; z-index:100020; color:#fff; background: rgba(0,0,0,0.35); padding:8px 12px; border-radius:10px; font-size:0.95rem; display:flex; gap:8px; align-items:center; }
      #player-age-badge{ position:absolute; left:18px; top:18px; z-index:100020; color:#111; background: #fff; padding:6px 10px; border-radius:8px; font-weight:700; }
      #player-title-thumb {
        position: absolute;
        left: calc(7%);
        top: 50%;
        transform: translateY(-50%);
        z-index: 100020;
        width: 40vh;
        max-width: 250px;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      }
      #player-title-thumb img{ width:100%; height:auto; display:block; }
      #player-legend.controls-hidden, #player-age-badge.controls-hidden, #player-title-thumb.controls-hidden { opacity:0; transform:translateY(6px) scale(.995); transition: opacity .28s ease, transform .28s ease; pointer-events:none; }

      /* Mobile overrides: thumb top-right, hide legend, hide skip buttons, full-width controls, progress flexible */
      @media screen and (max-width:720px) {
        #player-title-thumb { right:12px; left:auto; top:12px; transform:none; width:20vh; max-width:22vh; }
        #player-legend { display:none !important; }
        #ctrl-rew, #ctrl-fwd { display:none !important; }
        #player-controls { left:0 !important; transform:none !important; width:calc(100% - 24px) !important; justify-content:space-between; padding:8px 12px !important; bottom:20px !important; gap:8px; }
        #ctrl-progress { width:100% !important; max-width:none !important; flex:1 1 auto; height:8px; }
        #player-controls button { min-width:44px; height:44px; font-size:1.1rem; }
      }

      @keyframes pop{ 0%{ transform:translate(-50%,-50%) scale(0.6); opacity:0 } 100%{ transform:translate(-50%,-50%) scale(1); opacity:1 } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "player-overlay";
    overlay.className = "hide";
    overlay.innerHTML = `
      <div class="player-wrap">
        <video id="player-video" playsinline webkit-playsinline></video>
        <div id="center-pause"><i class="bi bi-pause-fill" style="font-size:7vh;color:rgba(255,255,255,0.95);"></i></div>

        <div id="player-title-thumb" class="controls-visible" style="display:none;">
          <img id="player-title-thumb-img" src="" alt="title"/>
        </div>

        <div id="player-age-badge" class="controls-visible" style="display:none;">N/A</div>

        <div id="player-legend" class="controls-visible" style="display:none;">
          <span><i class="bi bi-arrow-left-short"></i><i class="bi bi-arrow-right-short"></i> moverse</span>
          <span style="opacity:.85">|</span>
          <span><i class="bi bi-record-circle"></i> Enter: seleccionar</span>
        </div>

        <div id="player-controls" role="toolbar" aria-label="Controles de reproducción">
          <button id="ctrl-rew" aria-label="Retroceder 10s"><i class="bi bi-skip-backward-fill" style="font-size:1.2rem;"></i></button>
          <button id="ctrl-play" aria-label="Reproducir/Pausar"><i class="bi bi-play-fill" id="icon-play" style="font-size:1.2rem;"></i></button>
          <button id="ctrl-fwd" aria-label="Adelantar 10s"><i class="bi bi-skip-forward-fill" style="font-size:1.2rem;"></i></button>
          <input id="ctrl-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progreso (solo lectura)" />
          <div id="ctrl-time">00:00 / 00:00</div>
          <button id="ctrl-pause-reveal" aria-label="Pausar y mostrar"><i class="bi bi-box-arrow-in-down-right" style="transform:rotate(180deg);font-size:1.1rem;"></i></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async function ensureHlsLoaded() {
    if (window.Hls) return;
    await new Promise((res) => {
      const s = document.createElement("script"); s.src = HLS_CDN; s.onload = res; s.onerror = res; document.head.appendChild(s);
    });
  }

  async function attachHls(video, src) {
    if (window.Hls && window.Hls.isSupported()) {
      try { if (_hlsInstance && _hlsInstance.destroy) _hlsInstance.destroy(); } catch (e) {}
      const hls = new window.Hls();
      _hlsInstance = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      await new Promise((res) => {
        const t = setTimeout(res, 1800);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(t); res(); });
      });
    } else {
      video.src = src;
      await Promise.resolve();
    }
  }

  // --- Controls auto-hide helpers (ahora afectan legend/title/age también) ---
  function showControls() {
    const pc = $id("player-controls");
    const legend = $id("player-legend");
    const badge = $id("player-age-badge");
    const thumb = $id("player-title-thumb");
    if (pc) pc.classList.remove("controls-hidden");
    if (legend) { legend.style.display = ""; legend.classList.remove("controls-hidden"); }
    if (badge) { badge.style.display = ""; badge.classList.remove("controls-hidden"); }
    if (thumb) { thumb.style.display = ""; thumb.classList.remove("controls-hidden"); }
    controlsVisible = true;
    if (!keepControlsVisible) resetControlsHideTimer();
  }
  function hideControls() {
    if (keepControlsVisible) return;
    const pc = $id("player-controls");
    const legend = $id("player-legend");
    const badge = $id("player-age-badge");
    const thumb = $id("player-title-thumb");
    if (pc) pc.classList.add("controls-hidden");
    if (legend) legend.classList.add("controls-hidden");
    if (badge) badge.classList.add("controls-hidden");
    if (thumb) thumb.classList.add("controls-hidden");
    controlsVisible = false;
  }
  function resetControlsHideTimer() {
    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
    const overlay = $id("player-overlay");
    if (!overlay || !overlay.classList.contains("show")) return;
    if (keepControlsVisible) return;
    controlsHideTimer = setTimeout(() => { hideControls(); }, CONTROLS_HIDE_MS);
  }
  function onUserActivityInPlayer() {
    const overlay = $id("player-overlay");
    if (!overlay || !overlay.classList.contains("show")) return;
    showControls();
  }

  // -----------------------------
  // Resume UI helpers (usar #resume-container del HTML)
  // -----------------------------
  function hideResumeUI() {
    const container = $id("resume-container");
    const continueBtn = $id("resume-continue");
    if (container) {
      container.style.display = "none";
      container.setAttribute("aria-hidden", "true");
    }
    if (continueBtn) {
      continueBtn.style.display = "none";
      continueBtn.setAttribute("aria-hidden", "true");
    }
    // reset anchor visible state
    const anchor = $id("video1");
    if (anchor) {
      anchor.dataset.paused = "false";
      anchor.dataset.savedTime = "0";
      anchor.dataset.savedDuration = "0";
      try { anchor.innerHTML = '<i class="bi bi-play-fill"></i><span> Ver Ahora</span>'; } catch (e) {}
    }
  }

  // Muestra el UI de resume en el contenedor fijo del HTML
  function createResumeUI(anchor, saved) {
    if (!anchor || !saved) return;
    // si ya está al 96% o más consideramos terminado -> limpiar y no mostrar
    const pctCheck = (saved.duration && saved.duration > 0) ? Math.round((saved.time / saved.duration) * 100) : 0;
    if (pctCheck >= FINISHED_PCT) {
      // borrar registro y salir
      (async () => { try { await deleteProgress(String(saved.id || readIdFromPage())); } catch (e) {} })();
      hideResumeUI();
      return;
    }

    const container = $id("resume-container");
    const inner = $id("resume-progress-inner");
    const text = $id("resume-text");
    const continueBtn = $id("resume-continue");

    if (!container) return;

    const pct = (saved.duration && saved.duration > 0) ? Math.min(100, Math.round((saved.time / saved.duration) * 100)) : 0;

    // actualizar barra y texto
    if (inner) inner.style.width = pct + "%";
    if (text) text.textContent = `Continuar ${formatTime(saved.time)} (${pct}%)`;

    // marcar anchor como "hay progreso"
    anchor.dataset.paused = "true";
    anchor.dataset.savedTime = String(saved.time || 0);
    anchor.dataset.savedDuration = String(saved.duration || 0);
    anchor.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>';

    // mostrar el contenedor y el botón continuar
    container.style.display = "";
    container.setAttribute("aria-hidden", "false");
    if (continueBtn) {
      continueBtn.style.display = "";
      continueBtn.setAttribute("aria-hidden", "false");
      continueBtn.onclick = (ev) => {
        ev && ev.preventDefault();
        try { anchor && anchor.click(); } catch (e) { /* ignore */ }
        return false;
      };
    }

    // Asegurar que al hacer click en el anchor se reanude desde saved.time
    anchor.onclick = (ev) => {
      ev && ev.preventDefault();
      const savedTime = Number(anchor.dataset.savedTime || 0);
      const videoType = anchor.dataset.videoType || (anchor.getAttribute("data-video-type") || null);
      const href = anchor.getAttribute("data-video-url") || anchor.getAttribute("href") || "";
      if (href && (href.includes(".mp4") || href.includes(".m3u8"))) {
        const type = videoType || (href.includes(".m3u8") ? "m3u8" : "mp4");
        openPlayer(href, type, savedTime);
      } else {
        if (anchor.dataset.origOnclick) {
          try { eval(anchor.dataset.origOnclick); } catch(e) {}
        } else {
          alert("No hay enlace configurado para reanudar.");
        }
      }
      return false;
    };
  }

  // Actualiza la barra si ya está visible
  async function updateResumeUIIfPresent(id, cur, dur) {
    try {
      const container = $id("resume-container");
      if (!container || container.getAttribute("aria-hidden") === "true") return;
      const inner = $id("resume-progress-inner");
      const textEl = $id("resume-text");
      const pct = (dur && dur > 0) ? Math.min(100, Math.round((cur / dur) * 100)) : 0;

      // si alcanzó porcentaje de finalización, limpiar
      if (pct >= FINISHED_PCT) {
        await deleteProgress(id);
        hideResumeUI();
        return;
      }

      if (inner) inner.style.width = pct + "%";
      if (textEl) textEl.textContent = `Continuar ${formatTime(cur)} (${pct}%)`;
      const anchor = $id("video1");
      if (anchor) {
        anchor.dataset.savedTime = String(cur || 0);
        anchor.dataset.savedDuration = String(dur || 0);
      }
    } catch (e) {}
  }

  // abrir player con src y tipo (startAt opcional)
  async function openPlayer(src, type, startAt = 0) {
    injectOverlayHtml();
    const overlay = $id("player-overlay");
    const video = $id("player-video");
    const btnPlay = $id("ctrl-play");
    const btnRew = $id("ctrl-rew");
    const btnFwd = $id("ctrl-fwd");
    const progress = $id("ctrl-progress");
    const timeDiv = $id("ctrl-time");
    const btnPauseReveal = $id("ctrl-pause-reveal");
    const playerControls = $id("player-controls");
    const legend = $id("player-legend");
    const badge = $id("player-age-badge");
    const thumb = $id("player-title-thumb");
    const thumbImg = $id("player-title-thumb-img");

    if (!video) return;

    // al abrir player ocultamos UI de resume (si estaba visible)
    hideResumeUI();

    // set badge / thumb from UI if available
    try {
      const edadUI = ($id("edad") && $id("edad").textContent) || ($id("edad") && $id("edad").value) || "";
      if (badge) badge.textContent = (String(edadUI || "").trim()) || "N/A";
      const titleSrc = ($id("movie-title-image") && $id("movie-title-image").querySelector("img") && $id("movie-title-image").querySelector("img").src) || "";
      if (thumbImg && titleSrc) { thumbImg.src = titleSrc; thumb.style.display = ""; }
    } catch (e) {}

    if (_state.src !== src || _state.type !== type) {
      try { if (_hlsInstance && _hlsInstance.destroy) _hlsInstance.destroy(); } catch (e) {}
      video.removeAttribute("src");
      video.muted = false;
      if (type === "m3u8") {
        await ensureHlsLoaded();
        await attachHls(video, src);
      } else {
        video.src = src;
      }
      _state.src = src; _state.type = type;
    }

    document.body.classList.add("player-active");
    overlay.classList.remove("hide"); overlay.classList.add("show");
    overlay.style.pointerEvents = "auto";
    video.controls = false;

    if (playerControls) playerControls.classList.remove("controls-hidden");
    if (legend) legend.style.display = "";
    if (badge) badge.style.display = "";
    if (thumb) thumb.style.display = "";

    function updatePlayIcon() {
      const icon = $("#icon-play");
      if (!icon) return;
      icon.className = video.paused ? "bi bi-play-fill" : "bi bi-pause-fill";
    }

    function tick() {
      if (!video || !progress) return;
      const dur = video.duration || 0;
      progress.max = isFinite(dur) && dur > 0 ? Math.floor(dur) : 0;
      progress.value = Math.floor(video.currentTime || 0);
      timeDiv.textContent = `${formatTime(video.currentTime||0)} / ${formatTime(video.duration||0)}`;
    }

    // PLAY / PAUSE handler - aquí detectamos pausa desde botón de control
    btnPlay.onclick = () => {
      if (video.muted) video.muted = false;
      if (video.paused) {
        video.play().catch(()=>{});
        keepControlsVisible = false;
        resetControlsHideTimer();
      } else {
        try { video.pause(); } catch(e) {}
        keepControlsVisible = true;
        showControls();
      }
      updatePlayIcon();
      onUserActivityInPlayer();
    };

    btnRew.onclick = () => { try { video.currentTime = Math.max(0, (video.currentTime||0) - 10); } catch(e){} tick(); onUserActivityInPlayer(); };
    btnFwd.onclick = () => { try { video.currentTime = Math.min(video.duration||Infinity, (video.currentTime||0) + 10); } catch(e){} tick(); onUserActivityInPlayer(); };

    btnPauseReveal.onclick = () => {
      pauseAndRevealWithFocusLock();
      keepControlsVisible = true;
      showControls();
      // al "pausar y mostrar" también queremos mostrar el resume UI (mantenerlo visible)
      // guardamos progreso inmediatamente (para sincronizar barra)
      saveCurrentProgressImmediate();
      // y mostrar resume UI — el hydrateFromJSON creó la lógica del anchor, aquí solo actualizamos UI
      (async () => {
        const id = readIdFromPage();
        if (!id) return;
        const saved = await getProgress(id);
        if (saved && saved.time >= PROGRESS_MIN_SECONDS) {
          createResumeUI($id("video1"), saved);
        }
      })();
    };

    progress.setAttribute("aria-disabled", "true");
    progress.disabled = true;
    progress.style.pointerEvents = "none";

    // --- MOBILE: habilitar interacción táctil del progress solo en <=720px ---
    const isMobileViewport = (window.matchMedia && window.matchMedia('(max-width:720px)').matches);
    let onProgressInput = null;
    let onProgressCommit = null;
    if (isMobileViewport && progress) {
      progress.disabled = false;
      progress.style.pointerEvents = "auto";

      onProgressInput = (ev) => {
        const v = Number(ev.target.value || 0);
        // mostrar tiempo provisional en el timeDiv
        timeDiv.textContent = `${formatTime(v)} / ${formatTime(video.duration||0)}`;
      };
      onProgressCommit = (ev) => {
        try {
          const v = Number(ev.target.value || 0);
          if (isFinite(v) && v >= 0) {
            video.currentTime = Math.min(video.duration || Infinity, v);
            tick();
            // guardar el progreso tras el seek
            saveCurrentProgressImmediate();
          }
        } catch (e) {}
      };

      progress.addEventListener('input', onProgressInput);
      progress.addEventListener('change', onProgressCommit);
      progress.addEventListener('pointerup', onProgressCommit);
    }

    video.addEventListener("play", () => {
      _state.playing = true; _state.paused = false;
      keepControlsVisible = false;
      resetControlsHideTimer();
      updatePlayIcon();
      startAutoSaveProgress();
      // al reproducir ocultamos el resume UI (si estaba visible)
      hideResumeUI();
    });
    video.addEventListener("pause", () => {
      _state.playing = false; _state.paused = true;
      updatePlayIcon();
      saveCurrentProgressImmediate();
    });
    video.addEventListener("timeupdate", tick);
    video.addEventListener("loadedmetadata", () => {
      try {
        if (startAt && startAt > 1 && isFinite(video.duration) && startAt < video.duration) {
          video.currentTime = startAt;
        }
      } catch (e) {}
      tick();
    });
    video.addEventListener("ended", () => {
      updatePlayIcon();
      keepControlsVisible = false;
      resetControlsHideTimer();
      const pageId = readIdFromPage();
      if (pageId) { deleteProgress(pageId).catch(()=>{}); } // actualmente borra al terminar
      saveCurrentProgressImmediate();
      stopAutoSaveProgress();
      // al terminar, ocultar resume UI (no hay que reanudar)
      hideResumeUI();
    });

    const interval = setInterval(tick, 300);

    try {
      await video.play();
    } catch (err) {
      try {
        video.muted = true;
        await video.play();
        console.info("Autoplay sin sonido (fallback).");
      } catch (err2) {
        console.warn("Autoplay falló incluso en modo silenciado.", err2);
      }
    }

    setTimeout(() => { btnPlay && btnPlay.focus(); updatePlayIcon(); }, 150);

    resetControlsHideTimer();

    // activity listeners to reveal controls
    const activityHandler = () => onUserActivityInPlayer();
    document.addEventListener("keydown", activityHandler);
    document.addEventListener("mousemove", activityHandler);
    document.addEventListener("touchend", activityHandler);

    function cleanup() {
      clearInterval(interval);
      stopAutoSaveProgress();
      if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
      try { video.pause(); } catch(e) {}
      try { video.removeAttribute("src"); } catch(e) {}
      if (_hlsInstance && _hlsInstance.destroy) { try { _hlsInstance.destroy(); } catch(e) {} _hlsInstance = null; }
      document.body.classList.remove("player-active");
      overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none";
      const pagePlay = $id("video1"); if (pagePlay) pagePlay.innerHTML = '<i class="bi bi-play-fill"></i><span> Ver Ahora</span>';
      _state.playing = false; _state.paused = false; _state.src = ""; _state.type = "";
      document.removeEventListener("keydown", activityHandler);
      document.removeEventListener("mousemove", activityHandler);
      document.removeEventListener("touchend", activityHandler);
      if (playerControls) playerControls.classList.remove("controls-hidden");

      // limpiar listeners mobile del progress
      try {
        if (isMobileViewport && progress) {
          if (onProgressInput) progress.removeEventListener('input', onProgressInput);
          if (onProgressCommit) { progress.removeEventListener('change', onProgressCommit); progress.removeEventListener('pointerup', onProgressCommit); }
          progress.disabled = true;
          progress.style.pointerEvents = "none";
        }
      } catch (e) {}

      // asegurar ocultado del resume al cerrar
      hideResumeUI();
    }

    overlay._cleanup = cleanup;
    overlay._getPlayerElement = () => video;
    return cleanup;
  }

  // -----------------------------
  // Autosave helpers
  // -----------------------------
  function startAutoSaveProgress() {
    if (_progressAutoSaveInterval) return;
    _progressAutoSaveInterval = setInterval(saveCurrentProgressImmediate, AUTO_SAVE_INTERVAL_MS);
  }
  function stopAutoSaveProgress() {
    if (_progressAutoSaveInterval) { clearInterval(_progressAutoSaveInterval); _progressAutoSaveInterval = null; }
  }
  async function saveCurrentProgressImmediate() {
    try {
      const id = readIdFromPage();
      if (!id) return;
      const overlay = $id("player-overlay");
      const video = overlay && overlay._getPlayerElement ? overlay._getPlayerElement() : $id("player-video");
      if (!video) return;
      const cur = Math.floor(video.currentTime || 0);
      const dur = Math.floor(video.duration || 0);
      if (!isFinite(cur) || cur < 0) return;
      if (cur < PROGRESS_MIN_SECONDS) return;

      // Guardar en IDB
      const savedOk = await saveProgress(id, cur, dur);

      // calcular porcentaje y actuar si es >= FINISHED_PCT
      const pct = (dur && dur > 0) ? Math.round((cur / dur) * 100) : 0;
      if (pct >= FINISHED_PCT) {
        // considerar finalizado: borrar progreso y ocultar UI
        try { await deleteProgress(id); } catch (e) {}
        hideResumeUI();
        // forzar botón a estado "ver ahora"
        const anchor = $id("video1");
        if (anchor) {
          try { anchor.innerHTML = '<i class="bi bi-play-fill"></i><span> Ver Ahora</span>'; } catch(e){}
          anchor.dataset.paused = "false";
          anchor.dataset.savedTime = "0";
          anchor.dataset.savedDuration = "0";
        }
        return;
      }

      if (savedOk) {
        updateResumeUIIfPresent(id, cur, dur);
      }
    } catch (e) {
      console.warn("saveCurrentProgressImmediate error", e);
    }
  }

  // -----------------------------
  // Pause & Reveal con bloqueo de foco
  // -----------------------------
  function pauseAndRevealWithFocusLock(lockMs = 1800) {
    const overlay = $id("player-overlay");
    const video = $id("player-video");
    const pagePlay = $id("video1");
    const legend = $id("player-legend");
    const badge = $id("player-age-badge");
    const thumb = $id("player-title-thumb");
    if (!overlay || !video || !pagePlay) {
      try { if (!video.paused) video.pause(); } catch (e) {}
      if (overlay) { overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none"; }
      document.body.classList.remove("player-active");
      if (pagePlay) pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>';
      return;
    }

    try { if (!video.paused) video.pause(); } catch (e) {}
    _state.paused = true; _state.playing = false;
    overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none";
    document.body.classList.remove("player-active");

    pagePlay.dataset.paused = "true";
    pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>';
    pagePlay.setAttribute("tabindex", "0");
    pagePlay.setAttribute("aria-pressed", "true");

    function tryFocus() {
      try { pagePlay.focus({ preventScroll: false }); } catch (err) { try { pagePlay.focus(); } catch (e) {} }
    }
    tryFocus();
    setTimeout(tryFocus, 50);
    setTimeout(tryFocus, 200);

    keepControlsVisible = true;

    if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
    const playerControls = $id("player-controls");
    if (playerControls) playerControls.classList.remove("controls-hidden");
    if (legend) legend.classList.remove("controls-hidden");
    if (badge) badge.classList.remove("controls-hidden");
    if (thumb) thumb.classList.remove("controls-hidden");

    // mostrar resume UI al pausar+mostrar (sin recrearlo si ya existe)
    (async () => {
      const id = readIdFromPage();
      if (!id) return;
      const saved = await getProgress(id);
      if (saved && saved.time >= PROGRESS_MIN_SECONDS) {
        createResumeUI($id("video1"), saved);
      }
    })();

    if (window._focusLockTimer) { clearTimeout(window._focusLockTimer); window._focusLockTimer = null; }
    window._focusLock = true;

    const onFocusIn = (ev) => {
      if (!window._focusLock) return;
      if (ev.target !== pagePlay) {
        ev.preventDefault();
        tryFocus();
      }
    };
    const onKeyDownCapture = (ev) => {
      if (!window._focusLock) return;
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        tryFocus();
      }
      if (ev.key === "Enter") {
        if (pagePlay.dataset.paused === "true") {
          ev.preventDefault();
          clearFocusLock();
          if (window.resumeFromPause) window.resumeFromPause();
        }
      }
    };

    function clearFocusLock() {
      window._focusLock = false;
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDownCapture, true);
      if (window._focusLockTimer) { clearTimeout(window._focusLockTimer); window._focusLockTimer = null; }
    }

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDownCapture, true);

    window._focusLockTimer = setTimeout(() => {
      clearFocusLock();
      tryFocus();
    }, lockMs);
  }

  // Reanudar desde pausa (muestra overlay y pone foco en ctrl-play)
  function resumeFromPause() {
    const overlay = $id("player-overlay");
    const video = $id("player-video");
    const pagePlay = $id("video1");
    const overlayPlay = $id("ctrl-play") || (document.querySelector("#player-controls button"));

    if (!overlay || !video) {
      if (pagePlay) pagePlay.dataset.paused = "false";
      return;
    }

    document.body.classList.add("player-active");
    overlay.classList.remove("hide"); overlay.classList.add("show");
    overlay.style.pointerEvents = "auto";

    try { video.play().catch(()=>{}); } catch (e) {}

    _state.paused = false; _state.playing = true;

    if (pagePlay) {
      pagePlay.dataset.paused = "false";
      pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pausar</span>';
      pagePlay.setAttribute("aria-pressed", "false");
    }

    // quitar el lock de mantener controles visibles y permitir auto-hide
    keepControlsVisible = false;

    if (window._focusLockTimer) { clearTimeout(window._focusLockTimer); window._focusLockTimer = null; }
    window._focusLock = false;

    const pc = $id("player-controls"); if (pc) pc.classList.remove("controls-hidden");
    resetControlsHideTimer();

    // al reanudar, ocultar la UI de resume si estaba visible
    hideResumeUI();

    setTimeout(() => {
      try {
        if (overlayPlay) overlayPlay.focus({ preventScroll: false });
      } catch (err) {
        try { overlayPlay && overlayPlay.focus(); } catch (e) {}
      }
    }, 120);
  }

  function closePlayerCompletely() {
    const overlay = $id("player-overlay");
    if (overlay && overlay._cleanup) overlay._cleanup();
  }

  // --- Key handling: improved player controls navigation ---
  function installGlobalKeyHandlers() {
    document.addEventListener("keydown", (e) => {
      const overlay = $id("player-overlay");
      const overlayVisible = overlay && overlay.classList.contains("show");
      const video = $id("player-video");

      if (overlayVisible) onUserActivityInPlayer();

      if (overlayVisible) {
        const controls = Array.from(document.querySelectorAll("#player-controls button")).filter(b => b.offsetParent !== null);
        if (!controls || controls.length === 0) {
          if (e.key === "Enter") {
            const btnPlay = $id("ctrl-play");
            if (btnPlay) { btnPlay.click(); e.preventDefault(); }
          }
          return;
        }

        const active = document.activeElement;
        let idx = controls.indexOf(active);
        if (idx === -1) {
          if (e.key === "ArrowLeft") { controls[controls.length - 1].focus(); e.preventDefault(); return; }
          if (e.key === "ArrowRight" || e.key === "Enter") { controls[0].focus(); if (e.key === "Enter") { e.preventDefault(); controls[0].click(); } e.preventDefault(); return; }
        }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          const next = controls[(idx + 1) % controls.length];
          next && next.focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = controls[(idx - 1 + controls.length) % controls.length];
          prev && prev.focus();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (active && (active.tagName === "BUTTON" || active.tagName === "INPUT")) {
            active.click();
          } else {
            const btnPlay = $id("ctrl-play");
            btnPlay && btnPlay.click();
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          closePlayerCompletely();
        }
        return;
      }

      const focused = document.activeElement;
      if (e.key === "Enter") {
        if (focused && focused.id === "video1") { focused.click(); e.preventDefault(); }
      }
    });

    // --- TOUCH: en lugar de pausar/resumir al tocar pantalla, mostramos controles y permitimos interacción táctil ---
    document.addEventListener("touchend", (ev) => {
      const overlay = $id("player-overlay");
      const video = $id("player-video");
      if (!overlay || !video) return;
      if (overlay.classList.contains("show")) {
        // mostrar controles para permitir interacción (y en móvil activar el progress si estaba desactivado)
        showControls();
        if (window.matchMedia && window.matchMedia('(max-width:720px)').matches) {
          const progress = $id("ctrl-progress");
          if (progress) {
            try { progress.disabled = false; progress.style.pointerEvents = "auto"; } catch (e) {}
          }
        }
      }
    }, { passive: false });
  }

  // --- Hydrate page from JSON ---
  function readIdFromPage() {
    if (window.__movie_id) return String(window.__movie_id);
    const hid = $id("ID_pelicula"); if (hid && hid.value) return String(hid.value).trim();
    const m = location.pathname.match(/\/([^/]+)\.html$/); if (m) { const fname = m[1]; const id = fname.split("-")[0]; if (id) return id; }
    return null;
  }

  function renderGeneros(container, arr) {
    if (!container) return;
    container.innerHTML = "";
    (arr || []).forEach(g => {
      const span = document.createElement("span");
      span.className = "genre";
      span.textContent = (g || "").trim();
      container.appendChild(span);
    });
  }

  async function hydrateFromJSON() {
    const id = readIdFromPage();
    if (!id) { console.warn("No ID found"); return; }
    const base = await fetchMovieBase();
    if (!base) { console.warn("moviebase.json missing"); return; }
    const entry = base.find(x => String(x.id) === String(id));
    if (!entry) { console.warn("Id not present in moviebase.json:", id); return; }

    const titleTextEl = $id("movie-title-text");
    const titleImgEl = $id("movie-title-image") && $id("movie-title-image").querySelector("img");
    const fondo1 = $id("imagen-1"), fondo2 = $id("imagen-2");
    const descripcionEl = $id("descripcion") && ($id("descripcion").querySelector("p") || $id("descripcion"));
    const generoEl = $id("genero");
    const puntuacionStars = $id("puntuacion") && ($id("puntuacion").querySelector(".stars") || $id("puntuacion"));
    const edadEl = $id("edad"), anioEl = $id("año");
    const durH = $id("duracion-horas"), durM = $id("duracion-minutos");
    const coverInput = $id("cover-url"), coverInput2 = $id("cover-url-2");
    const paginaNombre = $id("pagina-nombre");

    if (titleTextEl) titleTextEl.textContent = entry.titulo || entry.title || "";
    if (titleImgEl && entry.titleimgUrl) titleImgEl.src = entry.titleimgUrl;
    if (fondo1 && entry.backgroundUrl) fondo1.src = entry.backgroundUrl;

    if (fondo2) {
      if (entry.backgroundmovil) {
        fondo2.src = entry.backgroundmovil;
        document.body.classList.add("has-mobile-bg");
      } else {
        document.body.classList.remove("has-mobile-bg");
      }
    }

    if (descripcionEl) {
      if (descripcionEl.tagName === "P") descripcionEl.textContent = entry.sinopsis || "";
      else descripcionEl.innerHTML = `<p>${(entry.sinopsis || "").replace(/\n/g, "<br>")}</p>`;
    }

    if (generoEl) renderGeneros(generoEl, entry.genero || []);
    if (puntuacionStars) crearEstrellas(puntuacionStars, entry.rating || 0);
    if (edadEl) edadEl.textContent = entry.edad || "";
    if (anioEl) anioEl.textContent = entry.año || "";
    if (durH) durH.textContent = entry.hora || "";
    if (durM) durM.textContent = entry.min || "";
    if (coverInput && entry.cardimgUrl) coverInput.value = entry.cardimgUrl;
    if (coverInput2 && entry.cardimgUrl2) coverInput2.value = entry.cardimgUrl2;
    if (paginaNombre && entry.link) paginaNombre.value = entry.link;

    const videoType = entry.video_type || window.__video_type || null;
    const videoUrl = entry.videourl || "";
    const anchor = $id("video1");
    if (!anchor) return;

    if (!anchor.dataset.origOnclick && anchor.onclick) {
      try { anchor.dataset.origOnclick = anchor.onclick.toString(); } catch (e) {}
    }
    if (videoUrl) anchor.setAttribute("data-video-url", videoUrl);
    if (videoType) anchor.setAttribute("data-video-type", videoType);

    if (videoType === "ok" && videoUrl) {
      anchor.setAttribute("href", okToEmbed(videoUrl));
      anchor.removeAttribute("onclick");
      anchor.setAttribute("target", "_blank");
    } else if ((videoType === "mp4" || videoType === "m3u8") && videoUrl) {
      anchor.setAttribute("href", "#");
      anchor.removeAttribute("target");
      anchor.onclick = (ev) => {
        ev && ev.preventDefault();
        if (anchor.dataset.paused === "true" && window.resumeFromPause) { window.resumeFromPause(); return false; }
        openPlayer(videoUrl, videoType);
        return false;
      };
    } else {
      if (videoUrl && videoUrl.includes("ok.ru")) { anchor.setAttribute("href", okToEmbed(videoUrl)); anchor.setAttribute("target", "_blank"); }
      else { anchor.setAttribute("href", "#"); anchor.onclick = (ev) => { ev && ev.preventDefault(); alert("No hay enlace configurado."); }; }
    }

    // check saved progress and show resume UI if present
    (async () => {
      try {
        const saved = await getProgress(id);
        if (saved && saved.time && Number(saved.time) >= PROGRESS_MIN_SECONDS) {
          // si el registro es antiguo (> CLEANUP_MS) lo borramos y no mostramos
          if (saved.updated && (Date.now() - Number(saved.updated)) > CLEANUP_MS) {
            try { await deleteProgress(id); } catch(e) {}
            hideResumeUI();
          } else {
            createResumeUI(anchor, saved);
            anchor.dataset.savedTime = String(saved.time || 0);
            anchor.dataset.savedDuration = String(saved.duration || 0);
          }
        } else {
          anchor.dataset.paused = "false";
        }
      } catch (e) {
        console.warn("getProgress error", e);
      }
    })();

    try { if (anchor && typeof anchor.focus === "function") anchor.focus(); } catch (e) {}

    const movieContent = $id("movie-content");
    if (movieContent) setTimeout(() => movieContent.classList.add("visible"), 200);

    const botonVolver = $id("back-button");
    const botonDonar = $id("donar-button") || $id("donar-button2") || (document.querySelector(".donar-button a"));
    const botonVerAhora = document.querySelector(".movie-buttons a") || $id("video1");
    const navegables = [botonVolver, botonVerAhora, botonDonar].filter(Boolean);

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const overlay = $id("player-overlay");
        if (overlay && overlay.classList.contains("show")) return;
        const current = document.activeElement;
        const idx = navegables.indexOf(current);
        if (idx === -1) {
          navegables[0] && navegables[0].focus();
          return;
        }
        if (e.key === "ArrowRight") {
          const nx = (idx + 1) % navegables.length; navegables[nx] && navegables[nx].focus();
        } else {
          const pv = (idx - 1 + navegables.length) % navegables.length; navegables[pv] && navegables[pv].focus();
        }
      }
    });

    document.querySelectorAll("button, a").forEach(el => { try { el.style.outline = "none"; } catch (e) {} });
  }

  // on page unload or visibilitychange save progress (best-effort)
  window.addEventListener("beforeunload", () => {
    saveCurrentProgressImmediate();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveCurrentProgressImmediate();
  });

  // init
  document.addEventListener("DOMContentLoaded", () => {
    const punt = $id("puntuacion");
    if (punt) {
      const ds = punt.dataset.puntuacion || punt.getAttribute("data-puntuacion");
      crearEstrellas(punt.querySelector(".stars") || punt, ds);
    }
    hydrateFromJSON().catch(e => console.warn("hydrate error", e));
  });

  // Exponer APIs públicas y handlers
  window.openPlayer = openPlayer;
  window.pauseAndReveal = pauseAndRevealWithFocusLock;
  window.resumeFromPause = resumeFromPause;
  window.closePlayerCompletely = closePlayerCompletely;

  window.setPlayerFocusColor = function(color) {
    try {
      FOCUS_RING_COLOR = color || FOCUS_RING_COLOR;
      document.documentElement.style.setProperty('--player-focus-color', FOCUS_RING_COLOR);
      const st = document.getElementById("player-overlay-styles");
      if (st) {
        st.textContent = st.textContent.replace(/:root\s*\{[^}]*\}/, `:root { --player-focus-color: ${FOCUS_RING_COLOR}; }`);
      }
    } catch (e) { console.warn('setPlayerFocusColor error', e); }
  };

  window.setPlayerControlsHideTimeout = function(ms) {
    if (!isFinite(ms) || ms < 0) return;
    CONTROLS_HIDE_MS = Number(ms);
    resetControlsHideTimer();
  };

  // instalar handlers globales al final (una vez)
  installGlobalKeyHandlers();

  // Exponer funciones de progreso para depuración (solo IDB)
  window.__progress = { saveProgress, getProgress, deleteProgress };

})();
