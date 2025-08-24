// script.js (plantilla) - player con controles minimalistas, progreso solo lectura y D-pad navigation
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

  function injectOverlayHtml() {
    if ($("#player-overlay")) return;

    // estilos minimalistas y flotantes (inline para no tocar styles.css)
    const style = document.createElement("style");
    style.id = "player-overlay-styles";
    style.textContent = `
      #player-overlay{ display:none; position:fixed; inset:0; z-index:99999; align-items:center; justify-content:center; background:rgba(0,0,0,0.92); transition:opacity .35s ease; }
      #player-overlay.show{ display:flex; opacity:1; pointer-events:auto; }
      #player-overlay.hide{ opacity:0; pointer-events:none; }
      #player-overlay .player-wrap{ width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      #player-overlay video{ width:100%; height:100%; max-height:100vh; object-fit:contain; background:#000; outline:none; }
      #player-controls{ position: absolute; bottom: 24px; left:50%; transform:translateX(-50%); display:flex; gap:10px; align-items:center; padding:8px 12px; backdrop-filter: blur(6px); background: rgba(0,0,0,0.25); border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,0.6); z-index:100010; max-width:90%; }
      #player-controls button{ background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border: none; color: #fff; padding:10px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:1.4rem; min-width:48px; height:48px; cursor:pointer; transition:transform .12s ease, background .12s; }
      #player-controls button:focus{ transform: scale(1.06); box-shadow: 0 6px 18px rgba(0,0,0,0.5), 0 0 0 4px rgba(138,88,194,0.12); outline:none; }
      #player-controls button:hover{ transform: translateY(-3px); }
      #ctrl-progress{ -webkit-appearance:none; appearance:none; width:320px; height:6px; border-radius:999px; background:rgba(255,255,255,0.15); pointer-events:none; }
      #ctrl-progress::-webkit-slider-thumb{ -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); pointer-events:none; }
      #ctrl-time{ color:#ddd; font-size:0.9rem; min-width:98px; text-align:right; margin-left:6px; }
      #center-pause{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:100020; display:none; align-items:center; justify-content:center; }
      #center-pause.show{ display:flex; animation: pop .28s ease; }
      @keyframes pop{ 0%{ transform:translate(-50%,-50%) scale(0.6); opacity:0 } 100%{ transform:translate(-50%,-50%) scale(1); opacity:1 } }
    `;
    document.head.appendChild(style);

    // overlay HTML
    const overlay = document.createElement("div");
    overlay.id = "player-overlay";
    overlay.className = "hide";
    overlay.innerHTML = `
      <div class="player-wrap">
        <video id="player-video" playsinline webkit-playsinline></video>
        <div id="center-pause"><i class="bi bi-pause-fill" style="font-size:7vh;color:rgba(255,255,255,0.95);"></i></div>
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

  // abrir player con src y tipo
  async function openPlayer(src, type) {
    injectOverlayHtml();
    const overlay = $id("player-overlay");
    const video = $id("player-video");
    const btnPlay = $id("ctrl-play");
    const btnRew = $id("ctrl-rew");
    const btnFwd = $id("ctrl-fwd");
    const progress = $id("ctrl-progress");
    const timeDiv = $id("ctrl-time");
    const btnPauseReveal = $id("ctrl-pause-reveal");
  
    if (!video) return;
  
    // si cambió la fuente, limpiar HLS anterior
    if (_state.src !== src || _state.type !== type) {
      try { if (_hlsInstance && _hlsInstance.destroy) _hlsInstance.destroy(); } catch (e) {}
      video.removeAttribute("src");
      // aseguramos que el video no esté forzado muted aquí — lo manejamos para autoplay
      video.muted = false;
      if (type === "m3u8") {
        await ensureHlsLoaded();
        await attachHls(video, src);
      } else {
        video.src = src;
      }
      _state.src = src; _state.type = type;
    }
  
    // mostrar overlay
    document.body.classList.add("player-active");
    overlay.classList.remove("hide"); overlay.classList.add("show");
    overlay.style.pointerEvents = "auto";
    video.controls = false;
  
    // actualizar icono play/pause
    function updatePlayIcon() {
      const icon = $("#icon-play");
      if (!icon) return;
      icon.className = video.paused ? "bi bi-play-fill" : "bi bi-pause-fill";
    }
  
    // progreso (solo lectura)
    function tick() {
      if (!video || !progress) return;
      const dur = video.duration || 0;
      progress.max = isFinite(dur) && dur > 0 ? Math.floor(dur) : 0;
      progress.value = Math.floor(video.currentTime || 0);
      timeDiv.textContent = `${formatTime(video.currentTime||0)} / ${formatTime(video.duration||0)}`;
    }
  
    // Handlers provisional hasta intentar autoplay
    btnPlay.onclick = () => {
      // Si el video está silenciado por fallback de autoplay, el primer click restaura sonido y reproduce
      if (video.muted) {
        video.muted = false; // permitir sonido después de interacción del usuario
      }
      if (video.paused) { video.play().catch(()=>{}); } else { video.pause(); }
      updatePlayIcon();
    };
    btnRew.onclick = () => { try { video.currentTime = Math.max(0, (video.currentTime||0) - 10); } catch(e){} tick(); };
    btnFwd.onclick = () => { try { video.currentTime = Math.min(video.duration||Infinity, (video.currentTime||0) + 10); } catch(e){} tick(); };
  
    // Pause & reveal (igual que antes)
    // Reemplazar el handler existente de btnPauseReveal por esto:
btnPauseReveal.onclick = () => {
  // usa la versión que pausa + oculta + asegura foco en #video1
  pauseAndRevealWithFocusLock();
};

  
    // Progreso solo lectura
    progress.setAttribute("aria-disabled", "true");
    progress.disabled = true;
    progress.style.pointerEvents = "none";
  
    // Eventos video
    video.addEventListener("play", () => { _state.playing = true; _state.paused = false; updatePlayIcon(); });
    video.addEventListener("pause", () => { _state.playing = false; _state.paused = true; updatePlayIcon(); });
    video.addEventListener("timeupdate", tick);
    video.addEventListener("loadedmetadata", tick);
    video.addEventListener("ended", () => { updatePlayIcon(); });
  
    // interval tick para suavizar
    const interval = setInterval(tick, 300);
  
    // Intentar autoplay: primero con sonido; si falla, hacemos fallback a muted autoplay
    let autoplayMutedFallback = false;
    try {
      // intentamos autoplay normal
      await video.play();
    } catch (err) {
      // bloqueo de autoplay -> silencioso y reintento
      try {
        video.muted = true;
        await video.play();
        autoplayMutedFallback = true;
        // opcional: notificar brevemente al usuario (sin alert molesto)
        console.info("Autoplay sin sonido (fallback). El usuario puede activar sonido con Play.");
      } catch (err2) {
        // no se pudo reproducir aún (algunos navegadores requieren interacción). Dejamos el estado pausado y el usuario deberá pulsar Play.
        console.warn("Autoplay falló incluso en modo silenciado.", err2);
      }
    }
  
    // Si se reprodujo en modo silenciado, al primer click en Play el handler lo desmuteará (ver btnPlay.onclick)
    // focus controles para D-pad
    setTimeout(() => { btnPlay && btnPlay.focus(); updatePlayIcon(); }, 150);
  
    // cleanup
    function cleanup() {
      clearInterval(interval);
      try { video.pause(); } catch(e) {}
      try { video.removeAttribute("src"); } catch(e) {}
      if (_hlsInstance && _hlsInstance.destroy) { try { _hlsInstance.destroy(); } catch(e) {} _hlsInstance = null; }
      document.body.classList.remove("player-active");
      overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none";
      const pagePlay = $id("video1"); if (pagePlay) pagePlay.innerHTML = '<i class="bi bi-play-fill"></i><span> Ver Ahora</span>';
      _state.playing = false; _state.paused = false; _state.src = ""; _state.type = "";
    }
  
    overlay._cleanup = cleanup;
    return cleanup;
  }
  // -----------------------------
// Pause & Reveal con bloqueo de foco
// -----------------------------
function pauseAndRevealWithFocusLock(lockMs = 1800) {
  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("player-video");
  const pagePlay = document.getElementById("video1");
  if (!overlay || !video || !pagePlay) {
    // Fallback directo (similar a tu implementación anterior)
    try { if (!video.paused) video.pause(); } catch (e) {}
    if (overlay) { overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none"; }
    document.body.classList.remove("player-active");
    if (pagePlay) pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>';
    return;
  }

  // 1) Pausar y ocultar overlay como antes
  try { if (!video.paused) video.pause(); } catch (e) {}
  _state.paused = true; _state.playing = false;
  overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none";
  document.body.classList.remove("player-active");

  // 2) Actualizar el botón UI y prepararlo para foco
  pagePlay.dataset.paused = "true";
  pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>';
  pagePlay.setAttribute("tabindex", "0");
  pagePlay.setAttribute("aria-pressed", "true");

  // 3) Forzar foco (varios intentos para navegadores testarudos)
  function tryFocus() {
    try {
      pagePlay.focus({ preventScroll: false });
    } catch (err) {
      try { pagePlay.focus(); } catch (e) {}
    }
  }
  tryFocus();
  setTimeout(tryFocus, 50);
  setTimeout(tryFocus, 200);

  // 4) Bloqueo temporal de foco para evitar que flechas o clicks lo muevan inmediatamente
  //    Mientras window._focusLock === true, intentamos restaurar el foco a pagePlay si se pierde,
  //    y evitamos que ArrowLeft/Right cambien el foco.
  if (window._focusLockTimer) {
    clearTimeout(window._focusLockTimer);
    window._focusLockTimer = null;
  }
  window._focusLock = true;

  const onFocusIn = (ev) => {
    if (!window._focusLock) return;
    // si algo distinto a pagePlay ganó foco, restauramos
    if (ev.target !== pagePlay) {
      ev.preventDefault();
      tryFocus();
    }
  };
  const onKeyDownCapture = (ev) => {
    if (!window._focusLock) return;
    // bloqueamos flechas laterales para que no muevan foco
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      tryFocus();
    }
    // permitir Enter para reanudar (si el user presiona Enter quiere reanudar)
    if (ev.key === "Enter") {
      if (pagePlay.dataset.paused === "true") {
        ev.preventDefault();
        // desalojar bloqueo y reanudar inmediatamente
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

  // auto-sin bloqueo después de lockMs ms
  window._focusLockTimer = setTimeout(() => {
    clearFocusLock();
    // asegurar que el pagePlay siga enfocado cuando se levanta el lock (suave)
    tryFocus();
  }, lockMs);
}

// -----------------------------
// Reanudar desde pausa (muestra overlay y pone foco en ctrl-play)
// -----------------------------
function resumeFromPause() {
  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("player-video");
  const pagePlay = document.getElementById("video1");
  const overlayPlay = document.getElementById("ctrl-play") || (document.querySelector("#player-controls button"));

  if (!overlay || !video) {
    // fallback ligero
    if (pagePlay) pagePlay.dataset.paused = "false";
    return;
  }

  // Mostrar overlay y reanudar
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

  // quitar cualquier bloqueo residual
  if (window._focusLockTimer) { clearTimeout(window._focusLockTimer); window._focusLockTimer = null; }
  window._focusLock = false;
  document.removeEventListener("focusin", () => {}, true);
  document.removeEventListener("keydown", () => {}, true);

  // poner foco en el play del overlay (mejor experiencia D-pad)
  setTimeout(() => {
    try {
      if (overlayPlay) overlayPlay.focus({ preventScroll: false });
    } catch (err) {
      try { overlayPlay && overlayPlay.focus(); } catch (e) {}
    }
  }, 120);
}

// Exponer (compatibilidad)
window.pauseAndReveal = pauseAndRevealWithFocusLock;
window.pauseAndRevealGlobal = pauseAndRevealWithFocusLock;
window.resumeFromPause = resumeFromPause;


  function pauseAndRevealGlobal() {
    const overlay = $id("player-overlay"), video = $id("player-video");
    if (!overlay || !video) return;
    try { if (!video.paused) video.pause(); } catch (e) {}
    _state.paused = true; _state.playing = false;
    overlay.classList.remove("show"); overlay.classList.add("hide"); overlay.style.pointerEvents = "none";
    document.body.classList.remove("player-active");
    const pagePlay = $id("video1");
    if (pagePlay) { pagePlay.dataset.paused = "true"; pagePlay.innerHTML = '<i class="bi bi-pause-fill"></i><span> Pulsa para reanudar</span>'; }
    const center = $id("center-pause"); if (center) { center.classList.add("show"); setTimeout(()=>center.classList.remove("show"), 900); }
  }

  function closePlayerCompletely() {
    const overlay = $id("player-overlay");
    if (overlay && overlay._cleanup) overlay._cleanup();
  }

  // D-PAD / Key handling when overlay visible: navigate between controls; Enter activates
  function installGlobalKeyHandlers() {
    document.addEventListener("keydown", (e) => {
      const overlay = $id("player-overlay");
      const overlayVisible = overlay && overlay.classList.contains("show");
      const video = $id("player-video");

      // If overlay visible -> D-pad navigates controls (no direct seek via arrows, only via rewind/forward buttons)
      if (overlayVisible) {
        const controls = Array.from(document.querySelectorAll("#player-controls button"));
        const active = document.activeElement;
        const idx = controls.indexOf(active);

        if (e.key === "ArrowRight") {
          e.preventDefault();
          const next = idx >= 0 ? controls[(idx + 1) % controls.length] : controls[0];
          next && next.focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = idx >= 0 ? controls[(idx - 1 + controls.length) % controls.length] : controls[controls.length - 1];
          prev && prev.focus();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (active && (active.tagName === "BUTTON" || active.tagName === "INPUT")) {
            active.click();
          } else {
            // fallback toggle play/pause
            const btnPlay = $id("ctrl-play");
            btnPlay && btnPlay.click();
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          closePlayerCompletely();
        }
        return;
      }

      // If overlay not visible: Enter on #video1 triggers click; left/right move main focus (back, play, donar)
      if (e.key === "Enter") {
        const focused = document.activeElement;
        if (focused && focused.id === "video1") { focused.click(); }
      }
    });

    // Touch: tap when overlay visible -> pause & reveal or resume
    document.addEventListener("touchend", (ev) => {
      const overlay = $id("player-overlay");
      const video = $id("player-video");
      if (!overlay || !video) return;
      if (overlay.classList.contains("show")) {
        if (!video.paused) pauseAndRevealGlobal();
        else { overlay.classList.remove("hide"); overlay.classList.add("show"); document.body.classList.add("player-active"); try{ video.play().catch(()=>{}); }catch(e){} }
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

    // mapeo campos
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
    if (puntuacionStars) crearEstrellas($id("#puntuacion .stars") || puntuacionStars, entry.rating || 0);
    if (edadEl) edadEl.textContent = entry.edad || "";
    if (anioEl) anioEl.textContent = entry.año || "";
    if (durH) durH.textContent = entry.hora || "";
    if (durM) durM.textContent = entry.min || "";
    if (coverInput && entry.cardimgUrl) coverInput.value = entry.cardimgUrl;
    if (coverInput2 && entry.cardimgUrl2) coverInput2.value = entry.cardimgUrl2;
    if (paginaNombre && entry.link) paginaNombre.value = entry.link;

    // configurar botón play
    const videoType = entry.video_type || window.__video_type || null;
    const videoUrl = entry.videourl || "";
    const anchor = $id("video1");
    if (!anchor) return;

    if (videoType === "ok" && videoUrl) {
      anchor.setAttribute("href", okToEmbed(videoUrl));
      anchor.removeAttribute("onclick");
      anchor.setAttribute("target", "_blank");
    } else if ((videoType === "mp4" || videoType === "m3u8") && videoUrl) {
      anchor.setAttribute("href", "#");
      anchor.removeAttribute("target");
      anchor.onclick = (ev) => { ev && ev.preventDefault(); openPlayer(videoUrl, videoType); return false; };
    } else {
      if (videoUrl && videoUrl.includes("ok.ru")) { anchor.setAttribute("href", okToEmbed(videoUrl)); anchor.setAttribute("target", "_blank"); }
      else { anchor.setAttribute("href", "#"); anchor.onclick = (ev) => { ev && ev.preventDefault(); alert("No hay enlace configurado."); }; }
    }

    // focus en play al abrir
    try { if (anchor && typeof anchor.focus === "function") anchor.focus(); } catch (e) {}

    // efecto entrada
    const movieContent = $id("movie-content");
    if (movieContent) setTimeout(() => movieContent.classList.add("visible"), 200);

    // navegación principal: back, play, donar
    const botonVolver = $id("back-button");
    const botonDonar = $id("donar-button") || $id("donar-button2") || (document.querySelector(".donar-button a"));
    const botonVerAhora = document.querySelector(".movie-buttons a") || $id("video1");
    const navegables = [botonVolver, botonVerAhora, botonDonar].filter(Boolean);

    // main nav: left/right entre back, play, donar
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const overlay = $id("player-overlay");
        if (overlay && overlay.classList.contains("show")) return; // no interferir con player nav
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

    // eliminar outlines por defecto
    document.querySelectorAll("button, a").forEach(el => { try { el.style.outline = "none"; } catch (e) {} });

    // instalar key handlers del player
    installPlayerKeyHandlers();
  }

  function installPlayerKeyHandlers() {
    installGlobalKeyHandlers();
  }

  // init
  document.addEventListener("DOMContentLoaded", () => {
    // inicializar estrellas si existe dataset
    const punt = $id("puntuacion");
    if (punt) {
      const ds = punt.dataset.puntuacion || punt.getAttribute("data-puntuacion");
      crearEstrellas(punt.querySelector(".stars") || punt, ds);
    }
    hydrateFromJSON().catch(e => console.warn("hydrate error", e));
  });

  // Exponer para que el sistema pueda invocarlos
  window.openPlayer = openPlayer;
  window.pauseAndReveal = pauseAndRevealGlobal;
  window.closePlayerCompletely = closePlayerCompletely;

})();
