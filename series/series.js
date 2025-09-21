// series.js - Versión con "scrub mode" (adelantar/retroceder) activado con ArrowRight desde Play/Pause
// Requiere: window.__series_id inyectado antes de cargar este script
const JSON_PATHS = ["./seriebase.json", "../seriebase.json", "/seriebase.json"];
const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@latest";

/* CONFIGURABLES */
const CLEANUP_DAYS = 7;
const CLEANUP_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000;
const AUTO_SAVE_MS = 5000;
const PROGRESS_MIN_SECONDS = 5;
const NEXT_EP_COUNTDOWN_SECS = 8;
const CONTROLS_HIDE_MS = 5000; // 5s inactive
const PROGRESS_STEP_SECONDS = 5; // segundos que avanza/retrocede con flechas en scrub mode

/* Helpers */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------------- IndexedDB helpers ---------------- */
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("series_progress_db_v1", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "id" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
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
  } catch (e) { return null; }
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
  } catch (e) { throw e; }
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
  } catch (e) { return false; }
}
async function idbGetAll() {
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const tx = db.transaction("progress", "readonly");
      const store = tx.objectStore("progress");
      const r = store.getAll();
      r.onsuccess = () => { res(r.result || []); db.close(); };
      r.onerror = () => { rej(r.error); db.close(); };
    });
  } catch (e) { return []; }
}

/* ---------------- Utils ---------------- */
function formatTime(s) {
  if (!isFinite(s) || s <= 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function okToEmbed(url) {
  if (!url) return url;
  try {
    if (url.includes("ok.ru") && url.includes("videoembed")) return url.startsWith("//") ? url : url.replace(/^https?:/, "");
    const m = url.match(/(\d{6,})/);
    if (m) return `//ok.ru/videoembed/${m[1]}?nochat=1&autoplay=1`;
    return url.startsWith("//") ? url : url.replace(/^https?:/, "");
  } catch (e) { return url; }
}

/* ---------------- fetch seriebase ---------------- */
async function fetchSerieBase() {
  for (const p of JSON_PATHS) {
    try {
      const r = await fetch(p, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      if (!Array.isArray(j)) continue;
      return j;
    } catch (err) {}
  }
  return null;
}

/* ---------------- HLS helpers ---------------- */
let _hlsInstance = null;
async function ensureHlsLoaded() {
  if (window.Hls) return;
  await new Promise(res => {
    const s = document.createElement("script"); s.src = HLS_CDN; s.onload = res; s.onerror = res; document.head.appendChild(s);
  });
}
async function attachHls(video, src) {
  if (window.Hls && window.Hls.isSupported()) {
    try { if (_hlsInstance && _hlsInstance.destroy) _hlsInstance.destroy(); } catch (e) {}
    const hls = new window.Hls(); _hlsInstance = hls;
    hls.loadSource(src); hls.attachMedia(video);
    await new Promise((res) => {
      const t = setTimeout(res, 2200);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(t); res(); });
    });
  } else {
    video.src = src;
  }
}

/* ---------------- Player overlay injection (estilos + HTML) ---------------- */
function injectOverlayHtmlAndStyles() {
  if (document.getElementById("player-overlay")) return;
  const style = document.createElement("style");
  style.id = "player-overlay-styles";
  style.textContent = `
    /* base overlay */
    #player-overlay{ display:none; position:fixed; inset:0; z-index:99999; align-items:center; justify-content:center; background:rgba(0,0,0,0.95); transition:opacity .35s ease; }
    #player-overlay.show{ display:flex; opacity:1; pointer-events:auto; }
    #player-overlay.hide{ opacity:0; pointer-events:none; }
    #player-overlay .player-wrap{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; position:relative; }

    /* video */
    #player-video{ width:100%; height:100%; max-height:100vh; object-fit:contain; background:#000; outline:none; }

    /* Top-left controls: pause/reveal then home */
    #ctrl-pause-reveal{ position:absolute; left:18px; top:14px; z-index:100035; width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,0.04); color:#fff; border:none; cursor:pointer; box-shadow: 0 8px 18px rgba(0,0,0,0.6); transition: opacity .18s ease, transform .12s; }
    #ctrl-home{ position:absolute; left:82px; top:14px; z-index:100034; width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,0.04); color:#fff; border:none; cursor:pointer; box-shadow: 0 8px 18px rgba(0,0,0,0.6); transition: opacity .18s ease, transform .12s; }
    #ctrl-pause-reveal:focus, #ctrl-home:focus { outline:none; background:#fff; color:#000; box-shadow:0 10px 30px rgba(0,0,0,0.6), 0 0 0 8px rgba(255,255,255,0.12); }

    #ctrl-pause-reveal.hidden, #ctrl-home.hidden { opacity:0; pointer-events:none; transform: translateY(-6px); }

    /* Player meta: moved lower, above controls */
    #player-meta-wrap{ position:absolute; left:18px; bottom:160px; z-index:100020; color:#fff; text-align:left; display:flex; flex-direction:column; gap:6px; align-items:flex-start; pointer-events:none; transition: opacity .18s ease; max-width:44%; }
    #player-tv-label{ font-size:0.95rem; opacity:0.95; color:#dcdcdc; font-weight:600; }
    #player-title{ font-size:1.6rem; font-weight:700; margin:0; }
    #player-season-epi{ font-size:1.0rem; opacity:0.95; color:#dcdcdc; }

    #player-legend{ position:absolute; left:18px; bottom:18px; z-index:100020; color:#fff; background: rgba(0,0,0,0.2); padding:8px 12px; border-radius:10px; font-size:1rem; display:flex; gap:8px; align-items:center; transition: opacity .18s ease; }

    /* controls container (play + large progress + time) - background removed (transparent) */
    #player-controls{ position:absolute; bottom:64px; left:50%; transform:translateX(-50%); display:flex; gap:12px; align-items:center; padding:8px 14px; background: transparent; border-radius: 999px; z-index:100010; transition: opacity .18s ease, transform .18s ease; }
    #player-controls.hidden { opacity:0; pointer-events:none; transform: translateY(6px) translateX(-50%); }

    /* play circular */
    #ctrl-play{ width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border:none; color:#fff; cursor:pointer; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
    #ctrl-play:focus { background:#fff !important; color:#000 !important; outline:none; box-shadow:0 12px 30px rgba(0,0,0,0.6), 0 0 0 10px rgba(255,255,255,0.12); }

    /* progress: largo casi todo el ancho */
    #ctrl-progress{ -webkit-appearance:none; appearance:none; height:8px; border-radius:999px; background:rgba(255,255,255,0.12); width:calc(100vw - 520px); max-width:1200px; transition: box-shadow .12s ease; }
    #ctrl-progress::-webkit-slider-runnable-track{ height:8px; border-radius:999px; background:rgba(255,255,255,0.12); }
    #ctrl-progress::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#fff; margin-top:-5px; box-shadow:0 2px 6px rgba(0,0,0,0.5); }
    #ctrl-progress:focus{ outline:none; box-shadow: 0 0 0 8px rgba(255,255,255,0.08); }

    #progress-filled { position:absolute; height:8px; border-radius:999px; left:0; top:0; pointer-events:none; background: #ff2e2e; transform-origin:left center; width:0%; }

    #progress-wrap{ position:relative; display:flex; align-items:center; gap:12px; width:calc(100vw - 520px); max-width:1200px; }

    #ctrl-time{ color:#ddd; min-width:110px; text-align:right; font-size:.95rem; }

    /* progress preview */
    #progress-preview{ position:absolute; bottom:106px; left:50%; transform:translateX(-50%); z-index:100040; display:none; align-items:center; gap:12px; background: rgba(0,0,0,0.6); padding:10px; border-radius:6px; color:#fff; min-width:160px; max-width:380px; }
    #progress-preview img{ width:140px; height:78px; object-fit:cover; border-radius:4px; background:#111; }
    #progress-preview .meta{ display:flex; flex-direction:column; gap:6px; font-size:0.95rem; }
    #progress-preview .meta .time{ font-weight:700; }

    /* caption when progress focused (icon + text) with oscillation */
    @keyframes oscillate { 0%{ transform: translateY(0px);} 50%{ transform: translateY(-6px);} 100%{ transform: translateY(0px);} }
    #progress-legend{ position:absolute; bottom:88px; left:50%; transform:translateX(-50%); z-index:100041; display:none; color:#fff; font-size:0.95rem; background: rgba(0,0,0,0.45); padding:8px 12px; border-radius:6px; display:flex; gap:8px; align-items:center; }
    #progress-legend i { margin-right:6px; vertical-align:middle; font-size:1.1rem; animation: oscillate 1.4s ease-in-out infinite; }

    /* Next episode stacked (right middle) */
    #next-ep-wrap{ position:absolute; right:48px; top:50%; transform:translateY(-50%); z-index:100025; display:flex; flex-direction:column; gap:8px; align-items:stretch; }
    #next-ep-wrap.hidden { display:none; }
    #next-ep-cta, #skip-ep-btn {
      border-radius:10px; padding:12px 16px; font-size:1rem; cursor:pointer; border:none; display:flex; align-items:center; justify-content:space-between;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    }
    #next-ep-cta{ background: linear-gradient(90deg,#8a2be2,#6fb3ff); color:#fff; }
    #skip-ep-btn{ background: rgba(255,255,255,0.06); color:#fff; border:1px solid rgba(255,255,255,0.04); }
    #next-ep-cta:focus, #skip-ep-btn:focus { outline:none; box-shadow: 0 12px 30px rgba(138,43,226,0.14); background:#fff; color:#000; }

    button:focus, .episode-btn:focus, .season-btn:focus, a:focus { outline: none !important; }
    * { -webkit-tap-highlight-color: transparent; }
    @media screen and (max-width:720px) {
      #ctrl-pause-reveal{ left:12px; top:12px; }
      #ctrl-home{ left:66px; top:12px; }
      #player-meta-wrap { left:12px; bottom:120px; max-width:unset; }
      #next-ep-wrap { right:18px; font-size:.95rem; }
      #player-controls{ left:16px; transform:none; width:calc(100% - 32px); justify-content:space-between; bottom:18px; }
      #ctrl-progress{ width:calc(100vw - 180px); max-width:none; }
      #progress-wrap{ width:calc(100vw - 180px); }
      #progress-preview img{ width:96px; height:56px; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "player-overlay";
  overlay.className = "hide";
  overlay.innerHTML = `
    <div class="player-wrap">
      <video id="player-video" playsinline webkit-playsinline></video>

      <!-- pause/reveal first, then home (restart) -->
      <button id="ctrl-pause-reveal" aria-label="Pausar y mostrar" title="Pausar y mostrar">
        <i class="bi bi-pause-fill" style="font-size:1.1rem"></i>
      </button>

      <button id="ctrl-home" aria-label="Volver al inicio" title="Volver al inicio">
        <i class="bi bi-arrow-counterclockwise" style="font-size:1.1rem"></i>
      </button>

      <div id="player-meta-wrap" aria-hidden="true">
        <div id="player-tv-label"><strong>Tv</strong> Series</div>
        <div id="player-title"></div>
        <div id="player-season-epi"></div>
      </div>

      <div id="player-legend">
        <span>◀ ▶ moverse</span>
        <span style="opacity:.6">|</span>
        <span>Enter: seleccionar</span>
      </div>

      <div id="player-controls" role="toolbar" aria-label="Controles">
        <button id="ctrl-play" tabindex="0" title="Play/Pausa"><i class="bi bi-play-fill" style="font-size:1.4rem"></i></button>
        <div id="progress-wrap">
          <div id="progress-container" style="position:relative;">
            <div id="progress-filled" aria-hidden="true"></div>
            <input id="ctrl-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progreso" />
          </div>
        </div>
        <div id="ctrl-time">00:00 / 00:00</div>
      </div>

      <div id="progress-preview" aria-hidden="true">
        <img id="progress-preview-img" src="" alt="preview" />
        <div class="meta"><div class="time">00:00</div><div class="pct">0%</div></div>
      </div>
      <div id="progress-legend"><i class="bi bi-caret-down-fill"></i> Pulsa para volver</div>

      <div id="next-ep-wrap" class="hidden" aria-hidden="true">
        <button id="next-ep-cta" tabindex="0" aria-label="Próximo episodio">
          <span class="label">Próximo episodio</span>
          <span class="countdown">${NEXT_EP_COUNTDOWN_SECS}</span>
        </button>
        <button id="skip-ep-btn" tabindex="0" aria-label="Omitir conteo">Omitir</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* ---------------- Player core + Next Episode + robust scrub (scrub = modo adelantar/retroceder) ---------------- */
let _autosaveInterval = null;
const _player_state = { src: "", type: "" };

function storageKeyFor(seriesId, sIdx, eIdx) { return `${String(seriesId)}::S${sIdx}::E${eIdx}`; }

async function openPlayer(src, type = "mp4", startAt = 0, cardEl = null, storageId = null) {
  injectOverlayHtmlAndStyles();

  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("player-video");
  const btnPlay = document.getElementById("ctrl-play");
  const btnPauseReveal = document.getElementById("ctrl-pause-reveal");
  const btnHome = document.getElementById("ctrl-home");
  const progress = document.getElementById("ctrl-progress");
  const progressFilled = document.getElementById("progress-filled");
  const progressPreview = document.getElementById("progress-preview");
  const previewImg = document.getElementById("progress-preview-img");
  const previewTime = progressPreview.querySelector(".meta .time");
  const previewPct = progressPreview.querySelector(".meta .pct");
  const progressLegend = document.getElementById("progress-legend");
  const timeDiv = document.getElementById("ctrl-time");
  const playerTitle = document.getElementById("player-title");
  const tvLabel = document.getElementById("player-tv-label");
  const seasonEpi = document.getElementById("player-season-epi");
  const nextWrap = document.getElementById("next-ep-wrap");
  const nextBtn = document.getElementById("next-ep-cta");
  const skipBtn = document.getElementById("skip-ep-btn");
  const playerControls = document.getElementById("player-controls");
  const playerMetaWrap = document.getElementById("player-meta-wrap");
  const playerLegend = document.getElementById("player-legend");

  // next episode state
  let nextShown = false;
  let nextCountdown = NEXT_EP_COUNTDOWN_SECS;
  let nextIntervalId = null;
  let nextAutoDisabled = false;
  let creditsStartSec = null;
  let nextExecuted = false;

  // hide controls timer
  let hideControlsTimer = null;

  // scrub (progress) mode flag and storage for children display states
  let scrubMode = false;
  const childrenPrevDisplay = new Map();

  // Funciones para activar/desactivar scrub mode (petición exacta del usuario)
  function enterScrubMode() {
    if (!playerControls || scrubMode) return;
    scrubMode = true;
    // Ocultar todos los elementos "arriba" y "laterales" excepto la barra de progreso y preview/legend
    try {
      // Guardamos display previo y ocultamos todos los hijos de playerControls excepto el progress-wrap
      Array.from(playerControls.children).forEach(child => {
        childrenPrevDisplay.set(child, child.style.display || "");
        if (child.id && child.id.includes("progress")) {
          child.style.display = "flex"; // mantener visible la progress area
        } else {
          child.style.display = "none";
        }
      });
      // ocultar pause/home/meta/legend/nextWrap para que solo quede la barra + preview + leyenda
      [btnPauseReveal, btnHome, playerMetaWrap, playerLegend, playerLegend, nextWrap].forEach(el => {
        if (!el) return;
        childrenPrevDisplay.set(el, el.style.display || "");
        el.style.display = "none";
      });
      // Mostrar preview y leyenda justo debajo y centrar barra (el CSS ya posiciona preview)
      progressPreview.style.display = "flex";
      progressPreview.setAttribute("aria-hidden", "false");
      progressLegend.style.display = "flex";
      // Llevar foco a input progress para que las flechas (izq/der) actúen
      try { progress.focus(); } catch (e) {}
      resetHideControlsTimer();
    } catch (e) { console.warn("enterScrubMode err", e); }
  }

  function exitScrubMode() {
    if (!playerControls || !scrubMode) return;
    scrubMode = false;
    try {
      // Restauramos displays guardados
      Array.from(playerControls.children).forEach(child => {
        if (childrenPrevDisplay.has(child)) child.style.display = childrenPrevDisplay.get(child) || "";
        else child.style.display = "";
      });
      [btnPauseReveal, btnHome, playerMetaWrap, playerLegend, nextWrap].forEach(el => {
        if (!el) return;
        if (childrenPrevDisplay.has(el)) el.style.display = childrenPrevDisplay.get(el) || "";
        else el.style.display = "";
      });
      childrenPrevDisplay.clear();
      // ocultar preview y legend
      progressPreview.style.display = "none";
      progressPreview.setAttribute("aria-hidden", "true");
      progressLegend.style.display = "none";
      // regresar foco al play/pause
      try { btnPlay.focus(); } catch (e) {}
      resetHideControlsTimer();
    } catch (e) { console.warn("exitScrubMode err", e); }
  }

  // Fill meta
  try {
    const ageText = (document.getElementById("edad")?.textContent || "").trim() || "N/A";
    const titleText = (document.getElementById("movie-title-text")?.textContent || "").trim() || "";
    playerTitle.textContent = titleText;
    let sLabel = cardEl?.getAttribute("data-season") || document.getElementById("video1")?.dataset.lastSeason || "";
    let eLabel = cardEl?.getAttribute("data-episode") || document.getElementById("video1")?.dataset.lastEpisode || "";
    if (sLabel && eLabel) seasonEpi.textContent = `${ageText} - S${sLabel} E${eLabel}`;
    else seasonEpi.textContent = ageText ? `${ageText}` : "";
    if (tvLabel) tvLabel.innerHTML = `<strong>Tv</strong> Series`;
  } catch (e) {}

  // set source if changed
  if (_player_state.src !== src || _player_state.type !== type) {
    try { if (_hlsInstance && _hlsInstance.destroy) _hlsInstance.destroy(); } catch (e) {}
    video.removeAttribute("src"); video.muted = false;
    if (type === "m3u8") { await ensureHlsLoaded(); await attachHls(video, src); } else video.src = src;
    _player_state.src = src; _player_state.type = type;
  }

  document.body.classList.add("player-active");
  overlay.classList.remove("hide"); overlay.classList.add("show");
  overlay.style.pointerEvents = "auto";
  video.controls = false;

  try { progress.tabIndex = 0; } catch (e) {}

  // initial focus on play
  setTimeout(()=>{ try { btnPlay.focus(); } catch(e) {} }, 120);

  function updatePlayIcon() {
    if (!btnPlay) return;
    btnPlay.innerHTML = video.paused ? `<i class="bi bi-play-fill" style="font-size:1.4rem"></i>` : `<i class="bi bi-pause-fill" style="font-size:1.4rem"></i>`;
  }

  function updateProgressUI() {
    const dur = video.duration || 0;
    const cur = video.currentTime || 0;
    const pct = (dur && dur > 0) ? Math.min(100, (cur / dur) * 100) : 0;
    try {
      progress.max = isFinite(dur) && dur > 0 ? Math.floor(dur) : 0;
      progress.value = Math.floor(cur || 0);
    } catch (e) {}
    if (progressFilled) progressFilled.style.width = pct + "%";
    if (timeDiv) timeDiv.textContent = `${formatTime(cur || 0)} / ${formatTime(dur || 0)}`;
    if (progressPreview && progressPreview.style.display === "flex") {
      previewTime.textContent = formatTime(Math.floor(cur || 0));
      previewPct.textContent = `${Math.round(pct)}%`;
    }
  }

  function tick() {
    if (!video) return;
    updateProgressUI();
    try {
      if (!creditsStartSec) creditsStartSec = computeCreditsStart();
      if (creditsStartSec && !nextShown && video.currentTime >= creditsStartSec) {
        showNextCta();
      }
      if (nextShown && creditsStartSec && video.currentTime < (creditsStartSec - 3)) {
        hideNextCta();
      }
    } catch (e) {}
  }

  function computeCreditsStart() {
    try {
      if (cardEl && cardEl.dataset && cardEl.dataset.creditsStart) {
        const val = Number(cardEl.dataset.creditsStart || 0);
        if (isFinite(val) && val > 0 && video.duration && val < video.duration) {
          return val;
        }
      }
      if (video.duration && isFinite(video.duration)) {
        const bySec = Math.max(0, video.duration - 90);
        const byPct = Math.max(0, Math.floor(video.duration * (1 - 0.12)));
        return Math.min(bySec, byPct);
      }
      return null;
    } catch (e) { return null; }
  }

  /* NEXT EP logic (sin tocar demasiado) */
  function startNextCountdown() {
    if (!nextShown || nextAutoDisabled || nextExecuted) return;
    if (nextIntervalId) return;
    nextIntervalId = setInterval(() => {
      try {
        if (video.paused) return;
        nextCountdown--;
        if (nextBtn) nextBtn.querySelector(".countdown").textContent = String(Math.max(0, nextCountdown));
        if (nextCountdown <= 0) {
          clearInterval(nextIntervalId); nextIntervalId = null;
          const nEl = findNextEpisodeElement(cardEl);
          if (nEl) { nextExecuted = true; doPlayNextEpisode(nEl); }
        }
      } catch (e) { clearInterval(nextIntervalId); nextIntervalId = null; }
    }, 1000);
  }
  function pauseNextCountdown() { if (nextIntervalId) { clearInterval(nextIntervalId); nextIntervalId = null; } }

  function showNextCta() {
    const nextEpisodeEl = findNextEpisodeElement(cardEl);
    if (!nextEpisodeEl) return;
    nextShown = true; nextExecuted = false; nextAutoDisabled = false; nextCountdown = NEXT_EP_COUNTDOWN_SECS;
    if (nextBtn) nextBtn.querySelector(".countdown").textContent = String(nextCountdown);
    if (nextWrap) { nextWrap.classList.remove("hidden"); nextWrap.setAttribute("aria-hidden", "false"); }
    if (!video.paused) startNextCountdown();
    setTimeout(()=>{ try { nextBtn.tabIndex = 0; nextBtn.focus(); } catch(e){} }, 90);

    nextBtn.onclick = (ev) => { ev && ev.preventDefault(); const nEl = findNextEpisodeElement(cardEl); if (nEl) doPlayNextEpisode(nEl); };
    skipBtn.onclick = (ev) => { ev && ev.preventDefault(); nextAutoDisabled = true; pauseNextCountdown(); try { skipBtn.focus(); } catch(e){} };
  }
  function hideNextCta() {
    nextShown = false; nextAutoDisabled = false; nextExecuted = false;
    pauseNextCountdown();
    if (nextWrap) { nextWrap.classList.add("hidden"); nextWrap.setAttribute("aria-hidden", "true"); }
    if (nextBtn) { nextBtn.onclick = null; nextBtn.onkeydown = null; }
    if (skipBtn) { skipBtn.onclick = null; skipBtn.onkeydown = null; }
  }

  function findNextEpisodeElement(currentCard) {
    try {
      if (!currentCard) return document.querySelector(".episode-btn");
      const s = Number(currentCard.getAttribute("data-season"));
      const e = Number(currentCard.getAttribute("data-episode"));
      const sameSeasonList = Array.from(document.querySelectorAll(`.episode-btn[data-season="${s}"]`));
      const idx = sameSeasonList.findIndex(x => x.getAttribute("data-episode") === String(e));
      if (idx >= 0 && idx < sameSeasonList.length - 1) return sameSeasonList[idx + 1];
      const nextSeasonBtn = document.querySelector(`.season-btn[data-season="${s + 1}"]`);
      if (nextSeasonBtn) {
        const nextFirst = document.querySelector(`.episode-btn[data-season="${s + 1}"]`);
        if (nextFirst) return nextFirst;
      }
      return null;
    } catch (err) { return null; }
  }

  async function doPlayNextEpisode(nextEl) {
    try {
      hideNextCta();
      if (!nextEl) { if (overlay && overlay._cleanup) overlay._cleanup(); return; }
      try { if (storageId) await idbDelete(storageId); } catch (e) {}
      try { if (cardEl) { const innerPrev = cardEl.querySelector(".card-progress-inner"); if (innerPrev) innerPrev.style.width = "0%"; cardEl.classList.remove("playing"); } } catch (e) {}
      if (overlay && overlay._cleanup) overlay._cleanup();
      setTimeout(() => { try { nextEl.click(); } catch (e) { console.warn("Could not trigger next episode click", e); } }, 180);
    } catch (e) { console.warn(e); }
  }

  /* Controls behavior */
  btnPlay.onclick = () => {
    if (video.paused) { video.play().catch(()=>{}); startAutoSave(storageId); startNextCountdownIfAppropriate(); } else { try { video.pause(); } catch (e) {} saveImmediate(storageId); pauseNextCountdown(); }
    updatePlayIcon();
    resetHideControlsTimer();
  };
  btnHome.onclick = () => {
    try { video.currentTime = 0; video.play().catch(()=>{}); updatePlayIcon(); } catch(e) {}
    resetHideControlsTimer();
  };
  btnPauseReveal.onclick = () => {
    try { video.pause(); } catch (e) {}
    saveImmediate(storageId);
    overlay.classList.remove("show"); overlay.style.pointerEvents = "none"; document.body.classList.remove("player-active");
    if (cardEl) {
      setTimeout(() => {
        try {
          cardEl.classList.add("focused-by-player");
          cardEl.focus({ preventScroll: false });
          cardEl.scrollIntoView({ block: "nearest", inline: "center" });
          const onBlurRemove = () => { cardEl.classList.remove("focused-by-player"); cardEl.removeEventListener("blur", onBlurRemove); };
          cardEl.addEventListener("blur", onBlurRemove, { once: true });
          setTimeout(() => { try { cardEl.classList.remove("focused-by-player"); } catch(e) {} }, 4000);
        } catch (e) {}
      }, 90);
    }
  };

  // progress interactions (mouse/keyboard)
  progress.addEventListener("focus", () => {
    // si el usuario navega con TAB o realmente focus al input, entramos a scrub mode también
    enterScrubMode();
    resetHideControlsTimer();
  });
  progress.addEventListener("blur", () => {
    // no cerramos automáticamente: el usuario debe pulsar ArrowDown para salir (según requisito).
  });

  progress.addEventListener("input", (ev) => {
    try {
      const v = Number(ev.target.value || 0);
      timeDiv.textContent = `${formatTime(v)} / ${formatTime(video.duration || 0)}`;
      const dur = video.duration || 0;
      const pct = (dur && dur > 0) ? Math.min(100, Math.round((v / dur) * 100)) : 0;
      if (progressFilled) progressFilled.style.width = pct + "%";
      showProgressPreview(v);
    } catch(e){}
    resetHideControlsTimer();
  });
  progress.addEventListener("change", (ev) => {
    try { video.currentTime = Number(ev.target.value || 0); updateProgressUI(); saveImmediate(storageId); } catch (e) {}
    resetHideControlsTimer();
  });

  // Key handling when progress has focus (input events)
  progress.addEventListener("keydown", (e) => {
    // Flecha arriba: no hace nada
    if (e.key === "ArrowUp") { e.preventDefault(); return; }

    // Flecha abajo: sale del scrub mode y vuelve al play/pause
    if (e.key === "ArrowDown") { e.preventDefault(); exitScrubMode(); return; }

    // Izquierda / Derecha en modo scrub: seek
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && scrubMode === true) {
      e.preventDefault();
      try {
        if (e.key === "ArrowLeft") video.currentTime = Math.max(0, (video.currentTime || 0) - PROGRESS_STEP_SECONDS);
        else video.currentTime = Math.min(video.duration || Infinity, (video.currentTime || 0) + PROGRESS_STEP_SECONDS);
        updateProgressUI();
        saveImmediate(storageId);
        showProgressPreview(video.currentTime || 0);
      } catch (err) {}
      resetHideControlsTimer();
      return;
    }

    // Enter toggles play
    if (e.key === "Enter") {
      e.preventDefault();
      try { btnPlay.click(); } catch (err) {}
      resetHideControlsTimer();
      return;
    }
  });

  // Document-level: prioriza scrubbing cuando scrubMode = true (cubre remotes que no enfocan el input)
  function documentScrubHandler(e) {
    if (!overlay || !overlay.classList.contains("show")) return;
    // solo actuamos si estamos en scrubMode
    if (!scrubMode) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      exitScrubMode();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      // explicitamente NO hacer nada
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      try {
        if (e.key === "ArrowLeft") video.currentTime = Math.max(0, (video.currentTime || 0) - PROGRESS_STEP_SECONDS);
        else video.currentTime = Math.min(video.duration || Infinity, (video.currentTime || 0) + PROGRESS_STEP_SECONDS);
        updateProgressUI();
        saveImmediate(storageId);
        showProgressPreview(video.currentTime || 0);
      } catch (err) {}
      resetHideControlsTimer();
      return;
    }
  }
  document.addEventListener("keydown", documentScrubHandler);

  // helper preview show/hide
  function showProgressPreview(timeSec) {
    if (!progressPreview) return;
    const dur = video.duration || 0;
    const pct = (dur && dur > 0) ? Math.round((timeSec / dur) * 100) : 0;
    previewTime.textContent = formatTime(Math.floor(timeSec || 0));
    previewPct.textContent = `${pct}%`;
    try {
      let imgSrc = "";
      if (cardEl) imgSrc = cardEl.querySelector("img")?.src || "";
      if (!imgSrc) imgSrc = document.getElementById("imagen-1")?.src || "";
      if (imgSrc) previewImg.src = imgSrc;
    } catch (e) {}
    progressPreview.style.display = "flex";
    progressPreview.setAttribute("aria-hidden","false");
    progressLegend.style.display = "flex";
  }
  function hideProgressPreview() {
    if (!progressPreview) return;
    progressPreview.style.display = "none";
    progressPreview.setAttribute("aria-hidden","true");
    progressLegend.style.display = "none";
  }

  // video listeners
  video.addEventListener("play", () => { updatePlayIcon(); startAutoSave(storageId); startNextCountdownIfAppropriate(); });
  video.addEventListener("pause", () => { updatePlayIcon(); saveImmediate(storageId); pauseNextCountdown(); });
  video.addEventListener("timeupdate", () => { tick(); });
  video.addEventListener("loadedmetadata", () => {
    try {
      if (startAt && startAt > 1 && isFinite(video.duration) && startAt < video.duration) video.currentTime = startAt;
      creditsStartSec = computeCreditsStart();
    } catch (e) {}
    tick();
  });
  video.addEventListener("ended", async () => {
    updatePlayIcon();
    try { if (storageId) await idbDelete(storageId); } catch (e) {}
    if (cardEl) { cardEl.classList.remove("playing"); const inner = card.querySelector(".card-progress-inner"); if (inner) inner.style.width = "0%"; }
    stopAutoSave();
    const nextEl = findNextEpisodeElement(cardEl);
    if (nextEl) { setTimeout(() => { try { nextEl.click(); } catch (e) {} }, 480); } else { setTimeout(() => { if (overlay && overlay._cleanup) overlay._cleanup(); }, 400); }
  });

  try { await video.play(); } catch (err) { try { video.muted = true; await video.play(); } catch (e) { console.warn("Autoplay failed", e); } }
  updatePlayIcon(); tick();

  // Auto-hide controls logic
  function showControlsImmediateVisuals() {
    if (playerControls) playerControls.classList.remove("hidden");
    if (playerMetaWrap) playerMetaWrap.style.opacity = "1";
    if (playerLegend) playerLegend.style.opacity = "1";
    if (btnPauseReveal) btnPauseReveal.classList.remove("hidden");
    if (btnHome) btnHome.classList.remove("hidden");
  }
  function hideControls() {
    if (playerControls) playerControls.classList.add("hidden");
    if (playerMetaWrap) playerMetaWrap.style.opacity = "0";
    if (playerLegend) playerLegend.style.opacity = "0";
    if (btnPauseReveal) btnPauseReveal.classList.add("hidden");
    if (btnHome) btnHome.classList.add("hidden");
    hideProgressPreview();
  }
  function resetHideControlsTimer() {
    showControlsImmediateVisuals();
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    hideControlsTimer = setTimeout(() => { hideControls(); }, CONTROLS_HIDE_MS);
  }
  resetHideControlsTimer();

  // overlay pointer handlers (re-show on mouse/touch)
  function onOverlayPointerActivity() { resetHideControlsTimer(); }
  function onOverlayTouchStart() { resetHideControlsTimer(); }
  overlay.addEventListener("mousemove", onOverlayPointerActivity);
  overlay.addEventListener("pointermove", onOverlayPointerActivity);
  overlay.addEventListener("touchstart", onOverlayTouchStart);

  // Overlay keyboard navigation (D-pad)
  function overlayKeyHandler(e) {
    const overlayEl = document.getElementById("player-overlay");
    if (!overlayEl || !overlayEl.classList.contains("show")) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Si estamos en scrubMode delegamos a documentScrubHandler (ya registrado) => ignoramos aquí
    if (scrubMode) return;

    // build candidates: pauseReveal, home, play, progress, next/skip if visible
    const candidatesBase = [btnPauseReveal, btnHome, btnPlay, progress].filter(Boolean);
    const nextVisible = nextWrap && !nextWrap.classList.contains("hidden");
    let candidates = candidatesBase.slice();
    if (nextVisible) {
      if (nextBtn) candidates.push(nextBtn);
      if (skipBtn) candidates.push(skipBtn);
    }

    const active = document.activeElement;
    const idx = candidates.indexOf(active);

    // If nothing focused among candidates, set defaults
    if (idx === -1) {
      if (e.key === "ArrowLeft") { e.preventDefault(); candidates[candidates.length - 1]?.focus(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); candidates[0]?.focus(); return; }
      if (e.key === "Enter") { e.preventDefault(); btnPlay && btnPlay.click(); return; }
      return;
    }

    // Navigation among candidates with left/right
    if (e.key === "ArrowRight") {
      e.preventDefault();
      // Si focus está en el Play/Pause, la especificación pide que ArrowRight active el modo de adelantar/retroceder
      if (active === btnPlay) { enterScrubMode(); return; }
      const next = candidates[(idx + 1) % candidates.length];
      if (next) { next.focus(); resetHideControlsTimer(); }
      return;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = candidates[(idx - 1 + candidates.length) % candidates.length];
      if (prev) { prev.focus(); resetHideControlsTimer(); }
      return;
    }

    // Vertical navigation rules
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (active === btnPauseReveal || active === btnHome) { try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === btnPlay) { try { progress.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === progress) {
        // Si estamos en el input, ArrowDown saldrá del modo scrub (por requerimiento), pero aquí no estamos en scrub,
        // así que al pulsar ArrowDown hacemos foco en play/pause.
        try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return;
      }
      if (active === nextBtn && nextVisible) { try { skipBtn.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === skipBtn && nextVisible) { /* bottom already */ return; }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (active === btnPlay) { try { btnPauseReveal.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === progress) { /* do nothing as requested */ return; }
      if (active === skipBtn && nextVisible) { try { nextBtn.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === nextBtn && nextVisible) { try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return; }
      return;
    }

    // Enter activates focused control
    if (e.key === "Enter") {
      e.preventDefault();
      if (active === btnPlay) { btnPlay.click(); return; }
      if (active === btnPauseReveal) { btnPauseReveal.click(); return; }
      if (active === btnHome) { btnHome.click(); return; }
      if (active === progress) { btnPlay.click(); return; }
      if (active === nextBtn) { nextBtn.click(); return; }
      if (active === skipBtn) { skipBtn.click(); return; }
      return;
    }

    // Escape / Backspace closes player
    if (e.key === "Escape" || e.key === "Backspace") {
      e.preventDefault();
      cleanup();
      return;
    }
  }
  document.addEventListener("keydown", overlayKeyHandler);

  // close handlers
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); cleanup(); } };
  document.addEventListener("keydown", onKey);

  function cleanup() {
    try { video.pause(); } catch (e) {}
    try { video.removeAttribute("src"); } catch (e) {}
    if (_hlsInstance && _hlsInstance.destroy) try { _hlsInstance.destroy(); } catch (e) {}
    _hlsInstance = null;
    stopAutoSave();
    pauseNextCountdown();
    hideNextCta();
    document.body.classList.remove("player-active");
    overlay.classList.remove("show"); overlay.style.pointerEvents = "none";
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("keydown", overlayKeyHandler);
    document.removeEventListener("keydown", documentScrubHandler);
    overlay.removeEventListener("mousemove", onOverlayPointerActivity);
    overlay.removeEventListener("pointermove", onOverlayPointerActivity);
    overlay.removeEventListener("touchstart", onOverlayTouchStart);
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    if (cardEl) {
      setTimeout(() => {
        try {
          cardEl.classList.add("focused-by-player");
          cardEl.focus({ preventScroll: false });
          cardEl.scrollIntoView({ block: "nearest", inline: "center" });
          cardEl.addEventListener("blur", () => cardEl.classList.remove("focused-by-player"), { once: true });
          setTimeout(() => cardEl.classList.remove("focused-by-player"), 4000);
        } catch (e) {}
      }, 90);
    }
  }
  overlay._cleanup = cleanup;
  overlay._getVideo = () => video;

  return cleanup;
}

/* helpers autopersistencia */
function startAutoSave(storageId) {
  if (_autosaveInterval) return;
  _autosaveInterval = setInterval(() => { saveImmediate(storageId); }, AUTO_SAVE_MS);
}
function stopAutoSave() { if (_autosaveInterval) { clearInterval(_autosaveInterval); _autosaveInterval = null; } }
async function saveImmediate(storageId) {
  try {
    if (!storageId) return;
    const overlay = document.getElementById("player-overlay");
    const video = overlay && overlay._getVideo ? overlay._getVideo() : document.getElementById("player-video");
    if (!video) return;
    const cur = Math.floor(video.currentTime || 0);
    const dur = Math.floor(video.duration || 0);
    if (!isFinite(cur) || cur < PROGRESS_MIN_SECONDS) return;
    await idbSet({ id: String(storageId), time: Number(cur), duration: Number(dur), updated: Date.now() });
  } catch (e) { console.warn("saveImmediate err", e); }
}

/* ---------------- D-pad & Hydrate UI (seasons/episodes) ---------------- */
/* (mantengo tu lógica anterior casi intacta; agregué que Enter en season salte al primer episodio) */
function focusElement(el) { if (!el) return false; try { el.focus(); return true; } catch (e) { return false; } }
function getTopControlsOrdered() {
  const arr = [];
  const back = document.getElementById("back-button");
  const play = document.getElementById("video1");
  const donar = document.querySelector(".donar-and-actions .donar-button a");
  const add = document.querySelector(".donar-and-actions .favorito-button a");
  const report = document.querySelector(".donar-and-actions .reportar-button a");
  if (back) arr.push(back);
  if (play) arr.push(play);
  if (donar) arr.push(donar);
  if (add) arr.push(add);
  if (report) arr.push(report);
  return arr;
}
function getSelectedSeasonButton() { return document.querySelector(".season-btn.selected") || document.querySelector(".season-btn"); }
function getEpisodesForSeasonIdx(sIdx) { if (!sIdx) return []; return Array.from(document.querySelectorAll(`.episode-btn[data-season="${String(sIdx)}"]`)); }
function focusFirstEpisodeOfSelectedSeason() {
  const sel = getSelectedSeasonButton();
  if (!sel) return false;
  const sIdx = sel.getAttribute("data-season");
  const eps = getEpisodesForSeasonIdx(sIdx);
  if (eps && eps.length) { focusElement(eps[0]); return true; }
  return false;
}
function storeLastSelection(seriesId, sIdx, eIdx) {
  try {
    const data = { seriesId, sIdx: String(sIdx), eIdx: String(eIdx), ts: Date.now() };
    localStorage.setItem("series_lastSelection", JSON.stringify(data));
    const pillText = document.getElementById("play-pill-text");
    if (pillText) pillText.textContent = `Play S${sIdx} E${eIdx}`;
    const playBtn = document.getElementById("video1");
    if (playBtn) { playBtn.dataset.lastSeason = String(sIdx); playBtn.dataset.lastEpisode = String(eIdx); }
  } catch (e) {}
}
async function handlePlayButtonAction() {
  const seriesId = window.__series_id;
  try {
    const last = localStorage.getItem("series_lastSelection");
    if (last) {
      const parsed = JSON.parse(last);
      if (String(parsed.seriesId) === String(seriesId) && parsed.sIdx && parsed.eIdx) {
        const card = document.querySelector(`.episode-btn[data-season="${parsed.sIdx}"][data-episode="${parsed.eIdx}"]`);
        if (card) { card.click(); return; }
      }
    }
    const all = await idbGetAll();
    const filtered = all.filter(r => String(r.id).startsWith(String(seriesId) + "::S"));
    if (filtered && filtered.length) {
      filtered.sort((a,b) => (b.updated || 0) - (a.updated || 0));
      const m = String(filtered[0].id).match(/::S(\d+)::E(\d+)/);
      if (m) {
        const sIdx = m[1], eIdx = m[2];
        const card = document.querySelector(`.episode-btn[data-season="${sIdx}"][data-episode="${eIdx}"]`);
        if (card) { card.click(); return; }
      }
    }
    const selSeason = getSelectedSeasonButton();
    const sIdx = selSeason ? selSeason.getAttribute("data-season") : (document.querySelector(".season-btn") ? document.querySelector(".season-btn").getAttribute("data-season") : null);
    if (sIdx) {
      const firstEp = document.querySelector(`.episode-btn[data-season="${sIdx}"]`);
      if (firstEp) { firstEp.click(); return; }
    }
    const anyEp = document.querySelector(".episode-btn");
    if (anyEp) anyEp.click();
  } catch (e) { console.warn("handlePlayButtonAction err", e); }
}

/* ---------------- Hydrate UI & logic (seasons/episodes) ---------------- */
/* Mantengo tu lógica de render y populación, con la parte importante: Enter en season salta al primer episodio */
async function hydrateFromJSON() {
  const seriesId = window.__series_id || null;
  if (!seriesId) { console.warn("No series id in window.__series_id"); return; }

  const base = await fetchSerieBase();
  if (!base) { console.warn("seriebase.json missing"); return; }

  const entry = base.find(x => String(x.id) === String(seriesId));
  if (!entry) { console.warn("series id not found in JSON:", seriesId); return; }

  // Background
  const bgHero = entry.backgroundHero || entry.backgroundUrl || "";
  const bgSection = document.getElementById("background-section");
  const img1 = document.getElementById("imagen-1");
  if (bgHero) {
    if (img1) img1.src = bgHero;
    if (bgSection) bgSection.style.backgroundImage = `url("${bgHero}")`;
  } else {
    if (img1) img1.src = entry.backgroundUrl || "";
    if (bgSection) bgSection.style.backgroundImage = entry.backgroundUrl ? `url("${entry.backgroundUrl}")` : "";
  }
  if (entry.backgroundmovil && document.getElementById("imagen-2")) document.getElementById("imagen-2").src = entry.backgroundmovil;

  // Title
  const titleEl = $("#movie-title-text");
  if (titleEl) titleEl.textContent = entry.title || entry.titulo || "";

  // Genres
  const generoEl = $("#genero"); if (generoEl) generoEl.innerHTML = "";
  if (Array.isArray(entry.genero)) {
    entry.genero.forEach(g => {
      const sp = document.createElement("span");
      sp.className = "genre";
      sp.textContent = g;
      generoEl.appendChild(sp);
    });
  }

  // year & age
  if ($("#edad")) $("#edad").textContent = entry.edad || "";
  if ($("#year-inline")) $("#year-inline").textContent = entry.año || "";

  /* rating helper */
  function renderStarsWithNumber(containerStars, containerNumber, val) {
    if (!containerStars || !containerNumber) return;
    containerStars.innerHTML = "";
    const rating = Number(val) || 0;
    const clamped = Math.max(0, Math.min(5, rating));
    const p = Math.round(clamped * 2) / 2;
    const completas = Math.floor(p);
    const mitad = p - completas >= 0.5;
    for (let i = 0; i < completas; i++) { const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star"); containerStars.appendChild(ico); }
    if (mitad) { const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-half"); containerStars.appendChild(ico); }
    for (let i = 0; i < 5 - completas - (mitad ? 1 : 0); i++) { const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-outline"); containerStars.appendChild(ico); }
    const number10 = Math.round((clamped / 5) * 10 * 10) / 10;
    containerNumber.textContent = `${number10.toFixed(1)}`;
  }
  const starsContainer = document.querySelector("#puntuacion .stars");
  const ratingNumberEl = document.getElementById("rating-number");
  renderStarsWithNumber(starsContainer, ratingNumberEl, entry.rating || entry.valor || 0);

  // Build seasons
  let seasons = [];
  if (Array.isArray(entry.seasons) && entry.seasons.length) {
    seasons = entry.seasons.map((s, idx) => ( {
      index: idx + 1,
      title: s.title || `Season ${idx+1}`,
      seasonDescription: s.seasonDescription || (s.description || entry.sinopsis || ''),
      seasonBackground: s.seasonBackground || '',
      episodes: Array.isArray(s.episodes) ? s.episodes.map((ep, ei) => ({
        epi: ep.epi || `E${ei+1}`,
        img: ep.img || ep.cardimgUrl || entry.cardimgUrl || '',
        url: ep.url || ep.videourl || ep.video || '',
        type: (ep.type || ep.video_type || '').toLowerCase(),
        credits_start: ep.credits_start || null
      })) : []
    }));  
  } else {
    const seasonCount = Number(entry.Season || entry.temporadas || entry.seasonsCount || 1);
    for (let s = 1; s <= Math.max(1, seasonCount); s++) {
      const episodes = [];
      for (let e = 1; e <= 50; e++) {
        const urlKey = `urlsea${s}epi${e}`;
        const imgKey = `imgsea${s}epi${e}`;
        if (entry[urlKey] || entry[imgKey]) {
          const url = entry[urlKey] || "";
          const img = entry[imgKey] || entry.cardimgUrl || "";
          let type = "";
          if (url.includes(".m3u8")) type = "m3u8";
          else if (url.includes(".mp4")) type = "mp4";
          else if (url.includes("ok.ru")) type = "ok";
          episodes.push({ epi: `E${e}`, img, url, type, credits_start: null });
        } else {
          if (e > 6) break;
        }
      }
      seasons.push({ index: s, title: `Season ${s}`, seasonDescription: entry.sinopsis || '', seasonBackground: '', episodes });
    }
  }

  // populate #seasons-count using entry.temporadas
  try {
    const seasonsCountEl = document.getElementById("seasons-count");
    let seasonsCountValue = null;
    if (entry && Object.prototype.hasOwnProperty.call(entry, 'temporadas')) {
      const parsed = Number(entry.temporadas);
      if (isFinite(parsed) && !isNaN(parsed)) seasonsCountValue = Math.max(0, Math.floor(parsed));
    }
    if (seasonsCountValue === null) seasonsCountValue = seasons.length || 0;
    if (seasonsCountEl) {
      const label = (seasonsCountValue === 1) ? "Temporada" : "Temporadas";
      seasonsCountEl.textContent = `${seasonsCountValue} ${label}`;
    }
  } catch (e) {}

  // description
  const descP = document.querySelector("#descripcion p");
  if (descP) descP.textContent = entry.sinopsis || "";

  // seasons UI
  const seasonsButtons = $("#seasons-buttons");
  const seasonsWrap = $("#seasons-wrap");
  if (!seasonsButtons) { console.warn("No #seasons-buttons container in DOM"); return; }
  seasonsButtons.innerHTML = "";

  function getSeasonScrollMetrics() {
    const btn = seasonsButtons.querySelector(".season-btn");
    const gapStyle = getComputedStyle(seasonsButtons).getPropertyValue('gap') || getComputedStyle(seasonsButtons).getPropertyValue('--season-gap') || '0px';
    const gap = parseFloat(gapStyle) || 0;
    const cardW = btn ? btn.offsetWidth : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--season-width')) || 120);
    return { gap, cardW };
  }

  function ensureSeasonInViewByIndex(idx1Based, smooth = true) {
    try {
      const total = seasons.length;
      if (!seasonsButtons) return;
      const idx0 = Number(idx1Based) - 1;
      const { gap, cardW } = getSeasonScrollMetrics();
      const step = cardW + gap;
      let target = 0;
      if (idx0 >= 2 && total > 3) {
        target = Math.max(0, Math.round((idx0 - 2) * step));
      } else {
        const btn = seasonsButtons.children[idx0];
        if (btn) {
          const br = btn.getBoundingClientRect();
          const containerRect = seasonsButtons.getBoundingClientRect();
          if (br.left < containerRect.left) {
            target = seasonsButtons.scrollLeft - (containerRect.left - br.left);
          } else if (br.right > containerRect.right) {
            target = seasonsButtons.scrollLeft + (br.right - containerRect.right);
          } else {
            target = seasonsButtons.scrollLeft;
          }
        }
      }
      if (smooth && seasonsButtons.scrollTo) seasonsButtons.scrollTo({ left: target, behavior: 'smooth' });
      else seasonsButtons.scrollLeft = target;
    } catch (e) {}
  }

  // create season buttons
  seasons.forEach((s, idx) => {
    const btn = document.createElement("button");
    btn.className = "season-btn";
    btn.setAttribute("data-season", String(s.index));
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("role", "tab");
    const imgSrc = s.seasonBackground || s.episodes[0]?.img || entry.cardimgUrl || "";
    btn.innerHTML = `<img src="${imgSrc}" alt="S${s.index}" loading="lazy" />`;
    if (idx === 0) btn.classList.add("selected");
    seasonsButtons.appendChild(btn);

    btn.addEventListener("focus", () => { try { ensureSeasonInViewByIndex(s.index, true); } catch(e) {} });

    btn.addEventListener("keydown", (e) => {
      const arr = Array.from(document.querySelectorAll(".season-btn"));
      const i = arr.indexOf(btn);
      if (e.key === "ArrowRight") { e.preventDefault(); if (i < arr.length - 1) arr[i+1].focus(); else arr[0].focus(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (i > 0) arr[i-1].focus(); else arr[arr.length-1].focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`); if (firstEp) firstEp.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); focusElement(document.getElementById("video1")); }
      else if (e.key === "Enter") {
        e.preventDefault();
        // Seleccionar temporada y saltar foco al primer episodio (robusto)
        try {
          Array.from(document.querySelectorAll(".season-btn")).forEach(x => x.classList.remove("selected"));
          btn.classList.add("selected");
          ensureSeasonInViewByIndex(s.index, true);

          const episodesListEl = document.getElementById("episodes-list");
          if (episodesListEl) episodesListEl.classList.add("updating");

          setTimeout(() => {
            renderEpisodesForSeason(btn.getAttribute("data-season"));
            setTimeout(() => {
              const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`);
              if (firstEp) { try { firstEp.focus(); } catch(e) {} }
              if (episodesListEl) episodesListEl.classList.remove("updating");
            }, 220);
          }, 90);
        } catch (er) {
          btn.click();
          setTimeout(() => {
            const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`);
            if (firstEp) try { firstEp.focus(); } catch(e) {}
          }, 300);
        }
        setTimeout(() => ensureSeasonInViewByIndex(s.index, true), 180);
      }
    });

    btn.addEventListener("click", () => {
      Array.from(document.querySelectorAll(".season-btn")).forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      ensureSeasonInViewByIndex(s.index, true);
      const episodesListEl = document.getElementById("episodes-list");
      if (episodesListEl) episodesListEl.classList.add("updating");
      setTimeout(() => {
        renderEpisodesForSeason(btn.getAttribute("data-season"));
        setTimeout(() => { if (episodesListEl) episodesListEl.classList.remove("updating"); }, 300);
        // IMPORTANTE: tras click también enfocar primer episodio
        setTimeout(() => {
          const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`);
          if (firstEp) try { firstEp.focus(); } catch(e) {}
        }, 280);
      }, 110);
    });
  });

  const episodesList = $("#episodes-list");
  if (!episodesList) { console.warn("No #episodes-list in DOM"); return; }

  function renderEpisodesForSeason(seasonIndex) {
    const seasonObj = seasons.find(s => Number(s.index) === Number(seasonIndex));
    if (!seasonObj) { episodesList.innerHTML = `<div style="color:#ddd">No hay episodios.</div>`; return; }

    const tempEl = document.getElementById("temporada-num");
    if (tempEl) tempEl.textContent = `Temporada ${seasonObj.index}`;
    const descEl = document.querySelector("#descripcion p");
    if (descEl) {
      descEl.style.opacity = "0";
      setTimeout(() => {
        descEl.textContent = seasonObj.seasonDescription || entry.sinopsis || '';
        descEl.style.opacity = "";
      }, 160);
    }

    episodesList.innerHTML = "";
    seasonObj.episodes.forEach((ep, i) => {
      const btn = document.createElement("button");
      btn.className = "episode-btn";
      btn.setAttribute("data-season", String(seasonObj.index));
      btn.setAttribute("data-episode", String(i + 1));
      btn.setAttribute("tabindex", "0");
      btn.setAttribute("role", "button");

      const url = String(ep.url || ep.videourl || ep.video || "");
      let vtype = String(ep.type || ep.video_type || "").toLowerCase();
      if (!vtype) {
        if (url.includes(".m3u8")) vtype = "m3u8";
        else if (url.includes("ok.ru")) vtype = "ok";
        else if (url.includes(".mp4")) vtype = "mp4";
        else vtype = "mp4";
      }
      btn.setAttribute("data-video-url", url);
      btn.setAttribute("data-video-type", vtype);
      if (ep.credits_start) btn.dataset.creditsStart = String(ep.credits_start);

      const imgUrl = ep.img || entry.cardimgUrl || "";
      const epiBadge = ep.epi || `E${i + 1}`;

      const img = document.createElement("img"); img.src = imgUrl; img.alt = epiBadge; img.loading = "lazy";
      const badge = document.createElement("div"); badge.className = "epi-badge"; badge.textContent = epiBadge;
      const progressWrap = document.createElement("div"); progressWrap.className = "card-progress-wrap";
      const progressInner = document.createElement("span"); progressInner.className = "card-progress-inner";
      progressWrap.appendChild(progressInner);

      btn.appendChild(img);
      btn.appendChild(badge);
      btn.appendChild(progressWrap);

      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        $$(".episode-btn.playing").forEach(x => x.classList.remove("playing"));
        const vUrl = btn.getAttribute("data-video-url") || "";
        const vType = (btn.getAttribute("data-video-type") || "").toLowerCase();
        const sIdx = btn.getAttribute("data-season"), eIdx = btn.getAttribute("data-episode");
        const sk = storageKeyFor(window.__series_id, sIdx, eIdx);

        if (!vUrl) { alert("No hay enlace configurado para este episodio."); return; }
        btn.classList.add("playing");
        storeLastSelection(window.__series_id, sIdx, eIdx);

        if (vType === "ok" || vUrl.includes("ok.ru")) {
          window.open(okToEmbed(vUrl), "_blank");
          return;
        }
        const saved = await idbGet(sk);
        const startAt = saved?.time ? Number(saved.time) : 0;
        openPlayer(vUrl, (vType === "m3u8" ? "m3u8" : "mp4"), startAt, btn, sk);
      });

      btn.addEventListener("keydown", (e) => {
        const list = Array.from(document.querySelectorAll(`.episode-btn[data-season="${seasonObj.index}"]`));
        const idx = list.indexOf(btn);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const nx = Math.min(list.length - 1, idx + 1);
          focusElement(list[nx]);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (idx === 0) {
            const sbtn = getSelectedSeasonButton();
            if (sbtn) focusElement(sbtn);
            else focusElement(document.getElementById("video1"));
          } else {
            focusElement(list[idx - 1]);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const sbtn = getSelectedSeasonButton();
          if (sbtn) focusElement(sbtn);
        } else if (e.key === "Enter") {
          e.preventDefault();
          btn.click();
        }
      });

      episodesList.appendChild(btn);
    });

    setTimeout(() => {
      const first = document.querySelector(`.episode-btn[data-season="${seasonIndex}"]`);
      if (first) first.tabIndex = 0;
    }, 40);
  }

  // initial progress cleanup & selection logic
  const allProgress = await idbGetAll();
  for (const r of allProgress) {
    if (r.updated && (Date.now() - r.updated) > CLEANUP_MS) {
      try { await idbDelete(r.id); } catch (e) {}
    }
  }
  const relevant = allProgress.filter(r => String(r.id).startsWith(String(seriesId) + "::S"));
  relevant.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  let initialSeasonIdx = seasons[0]?.index || 1;
  if (relevant.length) {
    const m = String(relevant[0].id).match(/::S(\d+)::E(\d+)/);
    if (m) initialSeasonIdx = Number(m[1]);
  }

  try {
    if (seasons.length <= 3) {
      if (seasonsWrap) seasonsWrap.classList.add("no-scroll");
    } else {
      if (seasonsWrap) seasonsWrap.classList.remove("no-scroll");
    }
  } catch (e) {}

  const selBtn = document.querySelector(`.season-btn[data-season="${initialSeasonIdx}"]`);
  if (selBtn) {
    $$(".season-btn").forEach(b => b.classList.remove("selected"));
    selBtn.classList.add("selected");
    setTimeout(() => { ensureSeasonInViewByIndex(initialSeasonIdx, false); }, 80);
  }

  renderEpisodesForSeason(initialSeasonIdx);

  // focus last selection or first episode
  setTimeout(() => {
    try {
      const last = localStorage.getItem("series_lastSelection");
      if (last) {
        const parsed = JSON.parse(last);
        if (String(parsed.seriesId) === String(seriesId) && parsed.sIdx && parsed.eIdx) {
          const seasonBtn = document.querySelector(`.season-btn[data-season="${parsed.sIdx}"]`);
          if (seasonBtn) {
            $$(".season-btn").forEach(b => b.classList.remove("selected"));
            seasonBtn.classList.add("selected");
            ensureSeasonInViewByIndex(parsed.sIdx, true);
          }
          setTimeout(() => {
            const epBtn = document.querySelector(`.episode-btn[data-season="${parsed.sIdx}"][data-episode="${parsed.eIdx}"]`);
            if (epBtn) { try { epBtn.focus(); } catch (e) {} } else {
              const firstEp = document.querySelector(`.episode-btn[data-season="${parsed.sIdx}"]`);
              if (firstEp) { try { firstEp.focus(); } catch(e) {} }
            }
          }, 180);
        }
      } else {
        const firstEp = document.querySelector(`.episode-btn[data-season="${initialSeasonIdx}"]`);
        if (firstEp) { try { firstEp.focus(); } catch(e) {} }
      }
    } catch (e) {}
  }, 280);

  // hydrate progress bars
  const allNow = await idbGetAll();
  for (const rec of allNow) {
    const m = String(rec.id).match(/::S(\d+)::E(\d+)/);
    if (!m) continue;
    const sIdx = m[1], eIdx = m[2];
    const card = document.querySelector(`.episode-btn[data-season="${sIdx}"][data-episode="${eIdx}"]`);
    if (card) {
      const pct = (rec.duration && rec.duration > 0) ? Math.round((rec.time / rec.duration) * 100) : 0;
      const inner = card.querySelector(".card-progress-inner");
      if (inner) inner.style.width = pct + "%";
    }
  }

  if (relevant.length) {
    const m = String(relevant[0].id).match(/::S(\d+)::E(\d+)/);
    if (m) { const sIdx = m[1], eIdx = m[2]; storeLastSelection(seriesId, sIdx, eIdx); }
  } else {
    const first = document.querySelector(".episode-btn");
    if (first) storeLastSelection(seriesId, first.getAttribute("data-season"), first.getAttribute("data-episode"));
  }

  // initial top play focus
  setTimeout(() => {
    const playBtn = document.getElementById("video1");
    if (playBtn) focusElement(playBtn);
  }, 120);

  // Install global D-pad handler (non-player overlay)
  document.addEventListener("keydown", (ev) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const overlayEl = document.getElementById("player-overlay");
    if (overlayEl && overlayEl.classList.contains("show")) return;

    const topControls = getTopControlsOrdered();
    const active = document.activeElement;
    if (topControls.includes(active)) {
      const idx = topControls.indexOf(active);
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        const pv = Math.max(0, idx - 1);
        focusElement(topControls[pv]);
        return;
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        const nx = idx + 1;
        if (nx < topControls.length) { focusElement(topControls[nx]); return; }
        const firstEp = (function(){ const sel = getSelectedSeasonButton(); return sel ? document.querySelector(`.episode-btn[data-season="${sel.getAttribute('data-season')}"]`) : document.querySelector(".episode-btn"); })();
        if (firstEp) { focusElement(firstEp); return; }
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        const selSeason = getSelectedSeasonButton();
        if (selSeason) { focusElement(selSeason); return; }
        const firstSeason = document.querySelector(".season-btn");
        if (firstSeason) { focusElement(firstSeason); return; }
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (active && active.id === "video1") { handlePlayButtonAction(); return; }
        try { active.click(); } catch (e) {}
      }
      return;
    }

    if (active && active.classList && active.classList.contains("season-btn")) {
      return;
    }
    if (active && active.classList && active.classList.contains("episode-btn")) {
      return;
    }
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      const firstSeason = document.querySelector(".season-btn");
      if (firstSeason) { focusElement(firstSeason); return; }
    }
  });

  // UI actions
  const fav = document.getElementById("favorito"); if (fav) fav.addEventListener("click", (e) => { e.preventDefault(); alert("Añadido a favoritos (UI)"); });
  const rep = document.getElementById("reportar-video"); if (rep) rep.addEventListener("click", (e) => { e.preventDefault(); alert("Reportado (UI)"); });
  const shareBtn = document.getElementById("botonCompartir"); if (shareBtn) shareBtn.addEventListener("click", () => {
    const shareUrl = window.location.href;
    const title = $("#movie-title-text")?.innerText || "";
    const msg = `Estoy viendo ${title}: ${shareUrl}`;
    window.open(`whatsapp://send?text=${encodeURIComponent(msg)}`);
  });

} // end hydrateFromJSON

/* Init */
document.addEventListener("DOMContentLoaded", () => {
  hydrateFromJSON().catch(e => console.warn("hydrate error", e));
});
