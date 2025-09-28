// series.js - Versión corregida (topes navegación, skip no pausa, enter en scrub no pausa, CTA hide 2s, fixes)
const JSON_PATHS = ["./seriebase.json", "../seriebase.json", "/seriebase.json"];
const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@latest";

/* CONFIGURABLES */
const CLEANUP_DAYS = 7;
const CLEANUP_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000;
const AUTO_SAVE_MS = 5000;
const PROGRESS_MIN_SECONDS = 5;
const DEFAULT_CREDITS_SECONDS = 90;
const DEFAULT_CREDITS_PCT = 0.12;
const NEXT_EP_COUNTDOWN_SECS = 8;
const PROGRESS_STEP_SECONDS = 10;
const CONTROLS_HIDE_MS = 5000;

/* Helpers */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------- IndexedDB helpers (sin cambios) ---------------- */
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

    /* gaussian circular pause/mostrar UI */
    #ctrl-pause-reveal{ position:absolute; left:18px; top:18px; z-index:100020;
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 2px solid rgba(255,255,255,0.04);
      color:#fff; padding:0; border-radius:50%; width:56px; height:56px; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer; }

    /* gaussian home button */
    #ctrl-home{ position:absolute; left:86px; top:18px; z-index:100020;
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 2px solid rgba(255,255,255,0.04);
      color:#fff; padding:0; border-radius:50%; width:56px; height:56px; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer; }

    /* meta relocated just above controls */
    #player-meta-wrap{ position:absolute; left:18px; top:calc(100% - 210px); z-index:100020; color:#fff; text-align:left; transform: translateY(-8px); }
    #player-tv-label{ font-size:1rem; opacity:0.95; margin-bottom:6px; color:#dcdcdc; font-weight:600; }
    #player-title{ font-size:1.6rem; font-weight:700; margin-bottom:6px; font-family: var(--title-font, 'LEMONMILK'), sans-serif; }
    #player-season-epi{ font-size:1.0rem; opacity:0.95; color:#dcdcdc; }

    /* controls area - progress wide - background removed */
    #player-controls{ position:absolute; bottom:64px; left:50%; transform:translateX(-50%); display:flex; gap:12px; align-items:center; padding:8px 14px; backdrop-filter: none; background: transparent; border-radius: 999px; z-index:100010; width:calc(100% - 400px); justify-content:center; }
    #player-controls button{ background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border: none; color: #fff; padding:0; font-size:1.2rem; cursor:pointer; border-radius:50%; display:flex; align-items:center; justify-content:center; width:56px; height:56px; min-width:56px; transition: transform .12s ease, background .12s; }
    #player-controls button.focused{ background:#fff !important; color:#000 !important; }
    #player-controls .play-btn { width:64px; height:64px; }

    #progress-wrap{ display:flex; align-items:center; gap:12px; width:100%; max-width:1200px; height:48px; }
    #progress-wrap > div.progress-area{ position:relative; flex:1; height:10px; display:flex; align-items:center; }
    #ctrl-progress{ -webkit-appearance:none; appearance:none; width:100%; height:10px; border-radius:999px; background:transparent; position:relative; z-index:100011; margin:0; }
    #ctrl-progress::-webkit-slider-runnable-track{ height:10px; border-radius:999px; background: rgba(255,255,255,0.12); }
    #ctrl-progress::-moz-range-track{ height:10px; border-radius:999px; background: rgba(255,255,255,0.12); }
    #ctrl-progress::-webkit-slider-thumb{ -webkit-appearance:none; margin-top:-2px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); position:relative; z-index:100013; }
    #ctrl-progress::-moz-range-thumb{ width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); position:relative; z-index:100013; }

    /* red filled bar aligned exactly with track (behind thumb) */
    #progress-filled{ position:absolute; height:10px; border-radius:999px; left:0; top:0; pointer-events:none; background:#ff2e2e; width:0%; z-index:1; }

    /* preview (canvas only) - hidden by default */
    #progress-preview{ position:absolute; bottom:130px; left:50%; transform:translateX(-50%); z-index:100040; display:none; align-items:center; gap:12px; background: rgba(0,0,0,0.6); padding:10px; border-radius:6px; color:#fff; min-width:160px; max-width:420px; }
    #progress-preview canvas{ width:320px; height:180px; object-fit:cover; border-radius:4px; background:#111; }

    /* legend below preview */
    #progress-legend{ position:absolute; bottom:100px; left:50%; transform:translateX(-50%); z-index:100041; display:none; color:#fff; font-size:0.95rem; background: rgba(0,0,0,0.45); padding:8px 12px; border-radius:6px; display:flex; gap:8px; align-items:center; animation: pulse-legend 1.2s ease-in-out infinite; }
    @keyframes pulse-legend { 0% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-6px); } 100% { transform: translateX(-50%) translateY(0); } }

    /* next ep stack - default gaussian */
    #next-ep-wrap{ position:absolute; right:48px; top:50%; transform:translateY(-50%); z-index:100025; display:flex; flex-direction:column; gap:8px; align-items:stretch; }
    #next-ep-wrap.hidden{ display:none; }
    #next-ep-cta, #skip-ep-btn{ border-radius:10px; padding:12px 16px; font-size:1rem; cursor:pointer; border:none; display:flex; justify-content:space-between; align-items:center; }
    #next-ep-cta{ background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02)); color:#fff; border: 2px solid rgba(255,255,255,0.04); box-shadow: 0 10px 30px rgba(138,43,226,0.06); }
    #skip-ep-btn{ background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02)); color:#fff; border:1px solid rgba(255,255,255,0.04); }
    #next-ep-cta:focus, #skip-ep-btn:focus { background:#fff; color:#000; outline:none; }

    /* player legend moved to bottom-left */
    #player-legend{ position:absolute; left:18px; bottom:18px; z-index:100030; color:#fff; display:flex; gap:8px; align-items:center; background: rgba(0,0,0,0.28); padding:8px 10px; border-radius:8px; font-size:0.95rem; }
    #player-legend i { font-size:1.05rem; }

    /* focus visible for buttons (global) */
    button:focus, .season-btn:focus, .episode-btn:focus, a:focus { outline: none !important; box-shadow: none !important; }
    button:focus { background:#fff !important; color:#000 !important; }

    @media screen and (max-width:720px) {
      #player-controls{ left:16px; transform:none; width:calc(100% - 32px); justify-content:space-between; bottom:18px; }
      #ctrl-pause-reveal{ left:12px; top:12px; width:48px; height:48px; }
      #ctrl-home{ left:68px; top:12px; width:48px; height:48px; }
      #progress-preview canvas{ width:220px; height:124px; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "player-overlay";
  overlay.className = "hide";
  overlay.innerHTML = `
    <div class="player-wrap">
      <video id="player-video" playsinline webkit-playsinline></video>

      <!-- pause/mostrar UI (gaussian background) -->
      <button id="ctrl-pause-reveal" tabindex="0" title="Pausar y mostrar UI" aria-label="Pausar y mostrar UI">
        <i class="bi bi-eye" style="font-size:1.2rem"></i>
      </button>

      <!-- volver al inicio (gaussian) -->
      <button id="ctrl-home" tabindex="0" title="Volver al inicio" aria-label="Volver al inicio">
        <i class="bi bi-arrow-counterclockwise" style="font-size:1.1rem"></i>
      </button>

      <div id="player-meta-wrap">
        <div id="player-tv-label"><strong>Tv</strong> Series</div>
        <div id="player-title"></div>
        <div id="player-season-epi"></div>
      </div>

      <!-- legend of basic controls (left/right/enter + up/down icon) -->
      <div id="player-legend" aria-hidden="true">
        <span><i class="bi bi-arrow-left"></i> <i class="bi bi-arrow-right"></i> : <strong>Adelantar / Retroceder</strong></span>
        <span style="opacity:.6">|</span>
        <span><i class="bi bi-keyboard-fill"></i> Enter : <strong>Seleccionar / Salir</strong></span>
      </div>

      <div id="player-controls" role="toolbar" aria-label="Controles">
        <div id="progress-wrap">
          <button id="btn-play" tabindex="0" aria-label="Play/Pause" title="Play/Pause" class="play-btn">
            <i class="bi bi-play-fill" style="font-size:1.4rem"></i>
          </button>
          <div class="progress-area" style="position:relative;">
            <input id="ctrl-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progreso" />
            <div id="progress-filled"></div>
          </div>
          <div id="ctrl-time">00:00 / 00:00</div>
        </div>
      </div>

      <div id="progress-preview" aria-hidden="true">
        <canvas id="progress-preview-canvas" width="320" height="180" style="display:block"></canvas>
      </div>

      <div id="progress-legend" aria-hidden="true"><i class="bi bi-caret-down-fill"></i><span style="margin-left:6px">PULSA PARA VOLVER</span></div>

      <div id="next-ep-wrap" class="hidden" aria-hidden="true">
        <button id="next-ep-cta" aria-hidden="true"><span class="label">Próximo episodio</span><span class="countdown">${NEXT_EP_COUNTDOWN_SECS}</span></button>
        <button id="skip-ep-btn" aria-hidden="true">Omitir</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* ---------------- Player core + fixes ---------------- */
let _autosaveInterval = null;
const _player_state = { src: "", type: "" };

function storageKeyFor(seriesId, sIdx, eIdx) { return `${String(seriesId)}::S${sIdx}::E${eIdx}`; }

async function openPlayer(src, type = "mp4", startAt = 0, cardEl = null, storageId = null) {
  injectOverlayHtmlAndStyles();

  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("player-video");
  const btnPlay = document.getElementById("btn-play");
  const progress = document.getElementById("ctrl-progress");
  const timeDiv = document.getElementById("ctrl-time");
  const btnPauseReveal = document.getElementById("ctrl-pause-reveal");
  const btnHome = document.getElementById("ctrl-home");
  const playerMetaWrap = document.getElementById("player-meta-wrap");
  const progressPreview = document.getElementById("progress-preview");
  const previewCanvas = document.getElementById("progress-preview-canvas");
  const progressLegend = document.getElementById("progress-legend");
  const progressFilled = document.getElementById("progress-filled");
  const nextWrap = document.getElementById("next-ep-wrap");
  const nextBtn = document.getElementById("next-ep-cta");
  const skipBtn = document.getElementById("skip-ep-btn");
  const playerControls = document.getElementById("player-controls");
  const playerLegend = document.getElementById("player-legend");

  if (progressPreview) progressPreview.style.display = "none";
  if (progressLegend) progressLegend.style.display = "none";
  if (playerLegend) playerLegend.style.display = "flex";

  // Fill meta
  try {
    const ageText = (document.getElementById("edad")?.textContent || "").trim() || "N/A";
    document.getElementById("player-tv-label") && (document.getElementById("player-tv-label").textContent = "Tv Series");
    document.getElementById("player-title") && (document.getElementById("player-title").textContent = (document.getElementById("movie-title-text")?.textContent || "").trim());
    let sLabel = cardEl?.getAttribute("data-season") || document.getElementById("video1")?.dataset.lastSeason || "";
    let eLabel = cardEl?.getAttribute("data-episode") || document.getElementById("video1")?.dataset.lastEpisode || "";
    const seText = (sLabel && eLabel) ? `${(document.getElementById("edad")?.textContent || "").trim()} • S${sLabel} E${eLabel}` : (document.getElementById("edad")?.textContent || "").trim();
    document.getElementById("player-season-epi") && (document.getElementById("player-season-epi").textContent = seText);
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

  // STATE
  let scrubMode = false;
  let wasPlaying = false;
  let hideControlsTimer = null;
  let creditsStartSec = null;
  let nextShown = false;
  let nextIntervalId = null;
  let nextCountdown = NEXT_EP_COUNTDOWN_SECS;
  let nextAutoDisabled = false;
  let nextExecuted = false;
  let skipHideTimeout = null;
  let savedDisplay = new Map();
  let pendingSeekCallback = null;

  /***** UI Update helpers *****/
  function setPlayFocusedStyle(on) {
    if (!btnPlay) return;
    if (on) btnPlay.classList.add('focused');
    else btnPlay.classList.remove('focused');
  }
  function updatePlayIcon() {
    btnPlay.innerHTML = video.paused ? `<i class="bi bi-play-fill" style="font-size:1.4rem"></i>` : `<i class="bi bi-pause-fill" style="font-size:1.4rem"></i>`;
    setPlayFocusedStyle(document.activeElement === btnPlay);
  }
  function updatePauseRevealIcon() {
    if (!btnPauseReveal) return;
    const iconName = video && !video.paused ? 'bi-eye-slash' : 'bi-eye';
    btnPauseReveal.innerHTML = `<i class="${iconName}" style="font-size:1.2rem"></i>`;
  }
  function updateProgressUI() {
    const dur = video.duration || 0;
    const cur = Math.floor(video.currentTime || 0);
    if (isFinite(dur) && dur > 0) {
      progress.max = Math.floor(dur);
      progress.value = Math.floor(video.currentTime || 0);
      const pct = Math.round((cur / dur) * 100);
      if (progressFilled) progressFilled.style.width = pct + "%";
    } else {
      progress.max = 0; progress.value = 0;
      if (progressFilled) progressFilled.style.width = "0%";
    }
    timeDiv.textContent = `${formatTime(video.currentTime || 0)} / ${formatTime(video.duration || 0)}`;
    updatePauseRevealIcon();
  }

  /***** Ensure play button loses focused class when other top buttons get focus *****/
  function attachFocusBlurHandlers() {
    if (!btnPlay || !btnPauseReveal || !btnHome) return;
    btnPlay.addEventListener('focus', () => { setPlayFocusedStyle(true); });
    btnPlay.addEventListener('blur',  () => { setPlayFocusedStyle(false); });
    btnPauseReveal.addEventListener('focus', () => { setPlayFocusedStyle(false); });
    btnHome.addEventListener('focus', () => { setPlayFocusedStyle(false); });
    document.addEventListener('focusin', () => { setPlayFocusedStyle(document.activeElement === btnPlay); });
  }
  attachFocusBlurHandlers();

  /***** Next episode logic (improved skip) *****/
  function computeCreditsStart() {
    try {
      if (cardEl && cardEl.dataset && cardEl.dataset.creditsStart) {
        const val = Number(cardEl.dataset.creditsStart || 0);
        if (isFinite(val) && val > 0 && video.duration && val < video.duration) return val;
      }
      if (video.duration && isFinite(video.duration)) {
        const bySec = Math.max(0, video.duration - DEFAULT_CREDITS_SECONDS);
        const byPct = Math.max(0, Math.floor(video.duration * (1 - DEFAULT_CREDITS_PCT)));
        return Math.min(bySec, byPct);
      }
      return null;
    } catch (e) { return null; }
  }
  function pauseNextCountdown() { if (nextIntervalId) { clearInterval(nextIntervalId); nextIntervalId = null; } }
  function startNextCountdownIfAppropriate() {
    if (!nextShown || nextAutoDisabled || nextExecuted) return;
    if (nextIntervalId) return;
    if (video.paused) return;
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
  function showNextCta() {
    if (cardEl && cardEl._nextDisabled) return;
    const nextEpisodeEl = findNextEpisodeElement(cardEl);
    if (!nextEpisodeEl) return;
    nextShown = true; nextExecuted = false; nextAutoDisabled = false; nextCountdown = NEXT_EP_COUNTDOWN_SECS;
    if (nextBtn) nextBtn.querySelector(".countdown").textContent = String(nextCountdown);
    if (nextWrap) { nextWrap.classList.remove("hidden"); nextWrap.setAttribute("aria-hidden", "false"); }
    if (!video.paused) startNextCountdownIfAppropriate();
    nextBtn.onclick = (ev) => { ev && ev.preventDefault(); const nEl = findNextEpisodeElement(cardEl); if (nEl) doPlayNextEpisode(nEl); };
    nextBtn.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); nextBtn.click(); } };

    // SKIP handler: must NOT pause the video. Hide CTAs after 2s permanently.
    skipBtn.onclick = (ev) => {
      ev && ev.preventDefault();
      nextAutoDisabled = true;
      pauseNextCountdown();
      if (cardEl) cardEl._nextDisabled = true;
      // hide CTAs immediately and permanently after 2s
      hideNextCta(true);
      if (skipHideTimeout) clearTimeout(skipHideTimeout);
      skipHideTimeout = setTimeout(() => {
        if (nextWrap) { nextWrap.classList.add('hidden'); nextWrap.setAttribute('aria-hidden','true'); }
        if (nextIntervalId) { clearInterval(nextIntervalId); nextIntervalId = null; }
      }, 2000); // 2 seconds as requested
      // do NOT pause the video; maintain playback state
      try { btnPlay && btnPlay.focus(); } catch(e) {}
    };
    skipBtn.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); skipBtn.click(); } };
    setTimeout(()=>{ try { nextBtn.focus(); } catch(e){} }, 90);
  }
  function hideNextCta(removeHandlers=false) {
    nextShown = false; nextAutoDisabled = false; nextExecuted = false;
    pauseNextCountdown();
    if (nextWrap) { nextWrap.classList.add("hidden"); nextWrap.setAttribute("aria-hidden", "true"); }
    if (nextBtn && removeHandlers) { nextBtn.onclick = null; nextBtn.onkeydown = null; nextBtn.tabIndex = -1; }
    if (skipBtn && removeHandlers) { skipBtn.onclick = null; skipBtn.onkeydown = null; skipBtn.tabIndex = -1; }
    if (skipHideTimeout) { clearTimeout(skipHideTimeout); skipHideTimeout = null; }
  }
  async function doPlayNextEpisode(nextEl) {
    try {
      hideNextCta(true);
      if (!nextEl) { if (overlay && overlay._cleanup) overlay._cleanup(); return; }
      try { if (storageId) await idbDelete(storageId); } catch (e) {}
      try { if (cardEl) { const innerPrev = cardEl.querySelector(".card-progress-inner"); if (innerPrev) innerPrev.style.width = "0%"; cardEl.classList.remove("playing"); } } catch (e) {}
      if (overlay && overlay._cleanup) overlay._cleanup();
      setTimeout(() => { try { nextEl.click(); } catch (e) {} }, 180);
    } catch (e) { console.warn(e); }
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

  /***** SCRUB MODE (enter/exit + preview update) *****/
  function enterScrubMode(initialTime=null) {
    if (scrubMode) return;
    scrubMode = true;
    wasPlaying = !video.paused;
    try { video.pause(); } catch (e) {}
    // hide meta & control-buttons except progress bar
    const toHide = [btnPauseReveal, btnHome, playerMetaWrap, nextWrap];
    toHide.forEach(el => { if (!el) return; savedDisplay.set(el, el.style.display || ""); el.style.display = "none"; });
    // hide player legend when scrub is active
    if (playerLegend) { savedDisplay.set(playerLegend, playerLegend.style.display || ""); playerLegend.style.display = "none"; }

    // hide other children of playerControls except progress area
    Array.from(playerControls.children).forEach(child => {
      savedDisplay.set(child, child.style.display || "");
      child.style.display = "none";
    });
    // show only progress-wrap
    const progressWrap = document.getElementById("progress-wrap");
    if (progressWrap) { progressWrap.style.display = "flex"; }

    // show preview & legend (progressLegend)
    showProgressPreview(typeof initialTime === "number" ? initialTime : (video.currentTime || 0));
    if (progressLegend) progressLegend.style.display = "flex";
    try { progress.focus(); } catch (e) {}
    resetHideControlsTimer();
  }

  async function exitScrubMode() {
    if (!scrubMode) return;
    scrubMode = false;
    // restore saved displays
    for (const [el, display] of savedDisplay.entries()) {
      try { el.style.display = display || ""; } catch (e) {}
    }
    savedDisplay = new Map();
    // restore player legend
    if (playerLegend) playerLegend.style.display = "flex";
    hideProgressPreview();
    if (progressLegend) progressLegend.style.display = "none";
    try { btnPlay.focus(); } catch (e) {}
    try { if (wasPlaying) { video.play().catch(()=>{}); startNextCountdownIfAppropriate(); } } catch (e) {}
    resetHideControlsTimer();
  }

  /* preview drawing - try drawImage(video) */
  function drawPreviewFromVideo() {
    try {
      const ctx = previewCanvas.getContext('2d');
      const w = previewCanvas.width;
      const h = previewCanvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(video, 0, 0, w, h);
    } catch (e) {
      const ctx = previewCanvas.getContext('2d');
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,previewCanvas.width, previewCanvas.height);
      const imgSrc = cardEl?.querySelector("img")?.src || document.getElementById("imagen-1")?.src || "";
      if (!imgSrc) return;
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => { try { ctx.drawImage(im,0,0,previewCanvas.width, previewCanvas.height); } catch(e){} };
      im.src = imgSrc;
    }
  }
  function showProgressPreview(timeSec) {
    if (!progressPreview) return;
    try {
      if (pendingSeekCallback) { video.removeEventListener('seeked', pendingSeekCallback); pendingSeekCallback = null; }
      pendingSeekCallback = function() {
        drawPreviewFromVideo();
        if (pendingSeekCallback) { video.removeEventListener('seeked', pendingSeekCallback); pendingSeekCallback = null; }
      };
      video.addEventListener('seeked', pendingSeekCallback);
      try { video.currentTime = Math.max(0, Math.min(timeSec || 0, video.duration || timeSec)); } catch (e) { drawPreviewFromVideo(); }
      setTimeout(() => {
        if (pendingSeekCallback) { try { drawPreviewFromVideo(); video.removeEventListener('seeked', pendingSeekCallback); pendingSeekCallback = null; } catch(e){} }
      }, 300);
    } catch (e) { drawPreviewFromVideo(); }

    progressPreview.style.display = "flex";
    progressPreview.setAttribute("aria-hidden","false");
  }
  function hideProgressPreview() {
    if (!progressPreview) return;
    progressPreview.style.display = "none";
    progressPreview.setAttribute("aria-hidden","true");
  }

  /***** Progress input events *****/
  progress.addEventListener("input", (ev) => {
    const v = Number(ev.target.value || 0);
    timeDiv.textContent = `${formatTime(v)} / ${formatTime(video.duration || 0)}`;
    const dur = video.duration || 0;
    const pct = (dur && dur > 0) ? Math.min(100, Math.round((v / dur) * 100)) : 0;
    if (progressFilled) progressFilled.style.width = pct + "%";
    showProgressPreview(v);
    resetHideControlsTimer();
  });
  progress.addEventListener("change", (ev) => {
    try { video.currentTime = Number(ev.target.value || 0); updateProgressUI(); saveImmediate(storageId); } catch (e) {}
    resetHideControlsTimer();
  });

  // keyboard on progress: left/right seek, down/enter -> exit scrub and resume if wasPlaying
  progress.addEventListener("keydown", (e) => {
    const key = e.key || "";
    const code = e.keyCode || 0;
    if (key === "ArrowDown" || key === "Down" || code === 40) {
      e.preventDefault();
      exitScrubMode();
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      // same behavior as ArrowDown: exit scrub and resume if wasPlaying — do not pause
      exitScrubMode();
      return;
    }
    if (key === "ArrowLeft" || code === 37 || key === "ArrowRight" || code === 39) {
      e.preventDefault();
      try {
        if (key === "ArrowLeft" || code === 37) video.currentTime = Math.max(0, (video.currentTime || 0) - PROGRESS_STEP_SECONDS);
        else video.currentTime = Math.min(video.duration || Infinity, (video.currentTime || 0) + PROGRESS_STEP_SECONDS);
        updateProgressUI();
        saveImmediate(storageId);
        showProgressPreview(video.currentTime || 0);
      } catch(e){}
      resetHideControlsTimer();
      return;
    }
  });

  /* Play / Home / PauseReveal behavior */
  btnPlay.onclick = () => {
    if (video.paused) { video.play().catch(()=>{}); startAutoSave(storageId); startNextCountdownIfAppropriate(); } else { try { video.pause(); } catch (e) {} saveImmediate(storageId); pauseNextCountdown(); }
    updatePlayIcon();
    updatePauseRevealIcon();
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

  /* Video events */
  video.addEventListener("play", () => { updatePlayIcon(); startAutoSave(storageId); startNextCountdownIfAppropriate(); updatePauseRevealIcon(); });
  video.addEventListener("pause", () => { updatePlayIcon(); saveImmediate(storageId); pauseNextCountdown(); updatePauseRevealIcon(); });
  video.addEventListener("timeupdate", () => {
    updateProgressUI();
    try {
      if (!creditsStartSec) creditsStartSec = computeCreditsStart();
      if (creditsStartSec && !nextShown && video.currentTime >= creditsStartSec) showNextCta();
      if (nextShown && creditsStartSec && video.currentTime < (creditsStartSec - 3)) hideNextCta();
    } catch (e) {}
  });
  video.addEventListener("loadedmetadata", () => {
    try {
      if (startAt && startAt > 1 && isFinite(video.duration) && startAt < video.duration) video.currentTime = startAt;
      creditsStartSec = computeCreditsStart();
    } catch (e) {}
    updateProgressUI();
  });
  video.addEventListener("ended", async () => {
    updatePlayIcon();
    try { if (storageId) await idbDelete(storageId); } catch (e) {}
    if (cardEl) { cardEl.classList.remove("playing"); const inner = cardEl.querySelector(".card-progress-inner"); if (inner) inner.style.width = "0%"; }
    stopAutoSave();
    const nextEl = findNextEpisodeElement(cardEl);
    if (nextEl) {
      setTimeout(() => { try { nextEl.click(); } catch (e) {} }, 480);
    } else {
      setTimeout(() => { if (overlay && overlay._cleanup) overlay._cleanup(); }, 400);
    }
  });

  try { await video.play(); } catch (err) { try { video.muted = true; await video.play(); } catch (e) { console.warn("Autoplay failed", e); } }
  updatePlayIcon(); updateProgressUI();

  /***** Controls auto-hide & pointer activity (show again on any pointer/keyboard) *****/
  function showControlsImmediate() {
    if (playerControls) playerControls.style.opacity = "1";
    if (playerMetaWrap) playerMetaWrap.style.opacity = "1";
    if (btnPauseReveal) btnPauseReveal.style.opacity = "1";
    if (btnHome) btnHome.style.opacity = "1";
    if (btnPlay) btnPlay.style.opacity = "1";
    if (playerLegend) playerLegend.style.opacity = "1";
  }
  function hideControls() {
    if (scrubMode) return;
    if (playerControls) playerControls.style.opacity = "0";
    if (playerMetaWrap) playerMetaWrap.style.opacity = "0";
    if (btnPauseReveal) btnPauseReveal.style.opacity = "0";
    if (btnHome) btnHome.style.opacity = "0";
    if (btnPlay) btnPlay.style.opacity = "0";
    if (playerLegend) playerLegend.style.opacity = "0";
    hideProgressPreview();
  }
  function resetHideControlsTimer() {
    showControlsImmediate();
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    hideControlsTimer = setTimeout(() => { hideControls(); }, CONTROLS_HIDE_MS);
  }
  resetHideControlsTimer();
  function onPointerActivity() { resetHideControlsTimer(); }
  overlay.addEventListener("mousemove", onPointerActivity);
  overlay.addEventListener("pointermove", onPointerActivity);
  overlay.addEventListener("touchstart", onPointerActivity);

  /***** Key navigation (overlayKeyHandler) - robust rules implemented with topes *****/
  function overlayKeyHandler(e) {
    const overlayEl = document.getElementById("player-overlay");
    if (!overlayEl || !overlayEl.classList.contains("show")) return;
    const active = document.activeElement;
    const key = e.key || "";
    const code = e.keyCode || 0;

    // TOPES (límites) según tu requerimiento:
    // Play: ArrowDown, ArrowLeft -> tope (no hacer nada)
    if (active === btnPlay && (key === "ArrowDown" || key === "Down" || code === 40 || key === "ArrowLeft" || code === 37)) {
      // If press ArrowLeft or ArrowDown when on Play -> do nothing (topes)
      // but if ArrowLeft we already want to block (user asked that left should be a tope on Play)
      e.preventDefault();
      return;
    }
    // Pause/Mostrar UI: ArrowUp, ArrowLeft -> tope
    if (active === btnPauseReveal && (key === "ArrowUp" || key === "Up" || code === 38 || key === "ArrowLeft" || code === 37)) {
      e.preventDefault();
      return;
    }
    // Home (reiniciar): ArrowUp, ArrowRight -> tope
    if (active === btnHome && (key === "ArrowUp" || key === "Up" || code === 38 || key === "ArrowRight" || code === 39)) {
      e.preventDefault();
      return;
    }

    // If scrubMode active, handle exit keys specially (do not mix with other nav)
    if (scrubMode) {
      if (key === "ArrowDown" || key === "Down" || code === 40) {
        e.preventDefault(); exitScrubMode(); return;
      }
      if (key === "Enter") { e.preventDefault(); exitScrubMode(); return; }
      // left/right handled by progress element handlers
      return;
    }

    // Build navigation candidates for normal mode
    const baseCandidates = [btnPauseReveal, btnHome, btnPlay, progress].filter(Boolean);
    const nextVisible = nextWrap && !nextWrap.classList.contains("hidden");
    const candidates = baseCandidates.slice();
    if (nextVisible) { if (nextBtn) candidates.push(nextBtn); if (skipBtn) candidates.push(skipBtn); }

    const idx = candidates.indexOf(active);

    if (idx === -1) {
      if (key === "ArrowRight") { e.preventDefault(); candidates[0]?.focus(); return; }
      if (key === "ArrowLeft") { e.preventDefault(); candidates[candidates.length - 1]?.focus(); return; }
      if (key === "Enter") { e.preventDefault(); btnPlay && btnPlay.click(); return; }
      return;
    }

    // Right: if active is Play => special: enter scrub mode (user requested)
    if (key === "ArrowRight") {
      e.preventDefault();
      if (active === btnPlay) { enterScrubMode(); return; }
      const next = candidates[(idx + 1) % candidates.length];
      if (next) { next.focus(); resetHideControlsTimer(); }
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      const prev = candidates[(idx - 1 + candidates.length) % candidates.length];
      if (prev) { prev.focus(); resetHideControlsTimer(); }
      return;
    }

    if (key === "ArrowDown") {
      e.preventDefault();
      if (active === btnPauseReveal || active === btnHome) { try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === btnPlay) { /* tope: nothing */ return; }
      if (active === progress) { /* ignore - handled on progress element */ return; }
      if (active === nextBtn && nextVisible) { try { skipBtn.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === skipBtn && nextVisible) { try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return; }
      return;
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      if (active === btnPlay) { try { btnPauseReveal.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === progress) { /* topes: do nothing when pressing up from progress */ return; }
      if (active === skipBtn && nextVisible) { try { nextBtn.focus(); } catch(e){} resetHideControlsTimer(); return; }
      if (active === nextBtn && nextVisible) { try { btnPlay.focus(); } catch(e){} resetHideControlsTimer(); return; }
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      if (active === btnPlay) { btnPlay.click(); return; }
      if (active === btnPauseReveal) { btnPauseReveal.click(); return; }
      if (active === btnHome) { btnHome.click(); return; }
      if (active === progress) { enterScrubMode(); return; }
      if (active === nextBtn) { nextBtn.click(); return; }
      if (active === skipBtn) { skipBtn.click(); return; }
      return;
    }

    if (key === "Escape" || key === "Backspace") {
      e.preventDefault();
      cleanup();
      return;
    }
  }
  document.addEventListener("keydown", overlayKeyHandler);

  // Additional handler to ensure ArrowDown / Enter exit scrub on PC keyboard
  function globalScrubExitHandler(e) {
    const overlayEl = document.getElementById("player-overlay");
    if (!overlayEl || !overlayEl.classList.contains("show")) return;
    const key = e.key || "";
    const code = e.keyCode || 0;
    if (scrubMode && (key === "ArrowDown" || key === "Down" || code === 40 || key === "Enter")) {
      e.preventDefault();
      exitScrubMode();
    }
  }
  document.addEventListener("keydown", globalScrubExitHandler);

  /* cleanup & bindings removal */
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); cleanup(); } };
  document.addEventListener("keydown", onKey);

  function cleanup() {
    try { video.pause(); } catch (e) {}
    try { video.removeAttribute("src"); } catch (e) {}
    if (_hlsInstance && _hlsInstance.destroy) try { _hlsInstance.destroy(); } catch (e) {}
    _hlsInstance = null;
    stopAutoSave();
    pauseNextCountdown();
    hideNextCta(true);
    document.body.classList.remove("player-active");
    overlay.classList.remove("show"); overlay.style.pointerEvents = "none";
    document.removeEventListener("keydown", overlayKeyHandler);
    document.removeEventListener("keydown", globalScrubExitHandler);
    document.removeEventListener("keydown", onKey);
    overlay.removeEventListener("mousemove", onPointerActivity);
    overlay.removeEventListener("pointermove", onPointerActivity);
    overlay.removeEventListener("touchstart", onPointerActivity);
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    if (skipHideTimeout) clearTimeout(skipHideTimeout);
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

  // initial focus: Play (ensure pauseReveal does not steal focus)
  setTimeout(() => {
    try {
      btnPlay.focus();
      updatePlayIcon();
      if (btnPauseReveal) try { btnPauseReveal.blur(); } catch(e) {}
      if (btnHome) try { btnHome.blur(); } catch(e) {}
      updatePauseRevealIcon();
    } catch(e) {}
  }, 120);

  return cleanup;
}

/* auto-save helpers */
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
/* Mantengo la lógica que ya tenías (no la toco salvo donde era necesario para el foco en Enter sobre season -> first episode) */
function focusElement(el) {
  if (!el) return false;
  try { el.focus(); return true; } catch (e) { return false; }
}

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

function getSelectedSeasonButton() {
  return document.querySelector(".season-btn.selected") || document.querySelector(".season-btn");
}

function getEpisodesForSeasonIdx(sIdx) {
  if (!sIdx) return [];
  return Array.from(document.querySelectorAll(`.episode-btn[data-season="${String(sIdx)}"]`));
}

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
async function hydrateFromJSON() {
  const seriesId = window.__series_id || null;
  if (!seriesId) { console.warn("No series id in window.__series_id"); return; }

  const base = await fetchSerieBase();
  if (!base) { console.warn("seriebase.json missing"); return; }

  const entry = base.find(x => String(x.id) === String(seriesId));
  if (!entry) { console.warn("series id not found in JSON:", seriesId); return; }

  // BackgroundHero preferred
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

  // Title text (no title image)
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

  // year & age & rating
  if ($("#edad")) $("#edad").textContent = entry.edad || "";
  if ($("#year-inline")) $("#year-inline").textContent = entry.año || "";

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

  // Build seasons (same logic)
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

  // seasons-count from entry.temporadas
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

  /* --- Resto del rendering de seasons/episodes (idéntico a la versión que funcionaba) --- */
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
    } catch (e) { /* swallow */ }
  }

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

    btn.addEventListener("focus", (ev) => {
      try { ensureSeasonInViewByIndex(s.index, true); } catch(e) {}
    });

    btn.addEventListener("keydown", (e) => {
      const arr = Array.from(document.querySelectorAll(".season-btn"));
      const i = arr.indexOf(btn);
      if (e.key === "ArrowRight") { e.preventDefault(); if (i < arr.length - 1) arr[i+1].focus(); else arr[0].focus(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (i > 0) arr[i-1].focus(); else arr[arr.length-1].focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`); if (firstEp) firstEp.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); focusElement(document.getElementById("video1")); }
      else if (e.key === "Enter") {
        e.preventDefault();
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
          }, 180);
        }, 60);
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
        setTimeout(() => { const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`); if (firstEp) try { firstEp.focus(); } catch(e) {} }, 280);
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

  // initial season selection logic & focus (unchanged)
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

  // after render, focus logic from last selection (keeps behavior)
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
    if (m) {
      const sIdx = m[1], eIdx = m[2];
      storeLastSelection(seriesId, sIdx, eIdx);
    }
  } else {
    const first = document.querySelector(".episode-btn");
    if (first) storeLastSelection(seriesId, first.getAttribute("data-season"), first.getAttribute("data-episode"));
  }

  // initial focus to Play button in left column
  setTimeout(() => {
    const playBtn = document.getElementById("video1");
    if (playBtn) focusElement(playBtn);
  }, 120);

  // Top play handler
  const playBtn = document.getElementById("video1");
  if (playBtn) playBtn.addEventListener("click", (e) => { e && e.preventDefault(); handlePlayButtonAction(); });

  // Favorito / Report / Donar UI actions
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
