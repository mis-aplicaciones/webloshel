// series.js - Versión corregida (mejora: usar exactamente entry.temporadas para #seasons-count)
// Requiere: window.__series_id inyectado antes de cargar este script
const JSON_PATHS = ["./seriebase.json", "../seriebase.json", "/seriebase.json"];
const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@latest";

/* CONFIGURABLES (ajústalos si quieres) */
const CLEANUP_DAYS = 7;
const CLEANUP_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000;
const AUTO_SAVE_MS = 5000;
const PROGRESS_MIN_SECONDS = 5;

// Credit detection fallback:
const DEFAULT_CREDITS_SECONDS = 90; // si no hay marca, consideramos créditos últimos 90s (ajustable)
const DEFAULT_CREDITS_PCT = 0.12;   // o últimos 12% del vídeo (fallback)
const NEXT_EP_COUNTDOWN_SECS = 8;   // segundos del conteo regresivo

/* Short helpers */
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
      console.debug("Intentando cargar seriebase.json desde:", p);
      const r = await fetch(p, { cache: "no-store" });
      if (!r.ok) { console.debug("No ok:", p, r.status); continue; }
      const j = await r.json();
      if (!Array.isArray(j)) {
        console.warn("seriebase.json cargado pero no es un array:", p);
        continue;
      }
      console.debug("seriebase.json cargado desde:", p);
      return j;
    } catch (err) {
      console.debug("Error al cargar JSON desde", p, err);
    }
  }
  console.warn("seriebase.json no encontrado en rutas probadas:", JSON_PATHS);
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

    /* Player chrome */
    #player-age-badge{ position:absolute; left:18px; top:18px; z-index:100020; color:#111; background:#fff; padding:8px 10px; border-radius:10px; font-weight:700; font-size:1.2rem; }
    #player-meta-wrap{ position:absolute; left:18px; top:64px; z-index:100020; color:#fff; text-align:left; }
    #player-tv-label{ font-size:1rem; opacity:0.9; margin-bottom:6px; color:#dcdcdc; font-weight:600; }
    #player-title{ font-size:1.6rem; font-weight:700; margin-bottom:6px; font-family: var(--title-font, 'LEMONMILK'), sans-serif; }
    #player-season-epi{ font-size:1.0rem; opacity:0.95; color:#dcdcdc; }

    /* legend bottom-left */
    #player-legend{ position:absolute; left:18px; bottom:18px; z-index:100020; color:#fff; background: rgba(0,0,0,0.2); padding:8px 12px; border-radius:10px; font-size:1rem; display:flex; gap:8px; align-items:center; }

    /* controls (center bottom) - buttons circular, stronger focus ring */
    #player-controls{ position:absolute; bottom:64px; left:50%; transform:translateX(-50%); display:flex; gap:12px; align-items:center; padding:8px 14px; backdrop-filter: blur(6px); background: rgba(0,0,0,0.25); border-radius: 999px; z-index:100010; }
    #player-controls button{ background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border: none; color: #fff; padding:0; font-size:1.2rem; cursor:pointer; border-radius:50%; display:flex; align-items:center; justify-content:center; width:56px; height:56px; min-width:56px; transition: transform .12s ease, background .12s; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
    #player-controls button:focus{ outline:none; transform: scale(1.06); box-shadow: 0 10px 26px rgba(0,0,0,0.6), 0 0 0 10px rgba(138,43,226,0.28); }

    #ctrl-progress{ -webkit-appearance:none; appearance:none; width:320px; height:6px; border-radius:999px; background:rgba(255,255,255,0.12); }
    #ctrl-progress::-webkit-slider-thumb{ -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); }

    #ctrl-time{ color:#ddd; min-width:110px; text-align:right; font-size:.95rem; }

    /* Next episode CTA (center-right) */
    #next-ep-cta {
      position:absolute; right:48px; top:50%; transform:translateY(-50%); z-index:100025;
      background: linear-gradient(90deg,#8a2be2,#6fb3ff); color:#fff; border-radius:10px; padding:12px 16px;
      display:none; align-items:center; gap:10px; font-size:1rem; outline:none; cursor:pointer;
      box-shadow: 0 10px 30px rgba(138,43,226,0.18);
    }
    #next-ep-cta:focus{ outline: none; box-shadow: 0 12px 30px rgba(138,43,226,0.22); }
    #next-ep-cta .countdown { font-weight:700; padding:6px 8px; background: rgba(255,255,255,0.12); border-radius:6px; }

    /* pulsing ring */
    @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.12); } 70% { box-shadow: 0 0 0 10px rgba(255,255,255,0.02); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.00); } }
    #next-ep-cta.pulsing { animation: pulse-ring 1.2s infinite; }

    /* remove native outlines that cause "borde celeste" */
    button:focus, .episode-btn:focus, .season-btn:focus, a:focus { outline: none !important; }
    .episode-btn.focused-by-player { outline: none !important; border-color: #fff !important; box-shadow: 0 12px 36px rgba(255,255,255,0.06) !important; }

    * { -webkit-tap-highlight-color: transparent; }
    @media screen and (max-width:720px) {
      #player-age-badge { left:12px; top:12px; font-size:1rem; padding:6px 8px; }
      #player-meta-wrap { left:12px; top:46px; }
      #next-ep-cta { right:18px; font-size:.95rem; padding:10px 12px; }
      #player-controls{ left:16px; transform:none; width:calc(100% - 32px); justify-content:space-between; bottom:18px; }
      #ctrl-progress{ width:100%; max-width:none; flex:1 1 auto; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "player-overlay";
  overlay.className = "hide";
  overlay.innerHTML = `
    <div class="player-wrap">
      <video id="player-video" playsinline webkit-playsinline></video>

      <div id="player-age-badge">N/A</div>

      <div id="player-meta-wrap">
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
        <button id="ctrl-rew" tabindex="0" title="Retroceder 10s">⟲</button>
        <button id="ctrl-play" tabindex="0" title="Play/Pausa">▶</button>
        <button id="ctrl-fwd" tabindex="0" title="Adelantar 10s">⟳</button>
        <input id="ctrl-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progreso" />
        <div id="ctrl-time">00:00 / 00:00</div>
        <button id="ctrl-pause-reveal" tabindex="0" title="Pausar y mostrar">⤓</button>
      </div>

      <button id="next-ep-cta" aria-hidden="true" tabindex="0">
        <span class="label">Próximo episodio</span>
        <span class="countdown">${NEXT_EP_COUNTDOWN_SECS}</span>
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* ---------------- Player core + "Next Episode" logic (mejorado foco/D-pad) ---------------- */
let _autosaveInterval = null;
const _player_state = { src: "", type: "" };

function storageKeyFor(seriesId, sIdx, eIdx) { return `${String(seriesId)}::S${sIdx}::E${eIdx}`; }

async function openPlayer(src, type = "mp4", startAt = 0, cardEl = null, storageId = null) {
  injectOverlayHtmlAndStyles();
  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("player-video");
  const btnPlay = document.getElementById("ctrl-play");
  const btnRew = document.getElementById("ctrl-rew");
  const btnFwd = document.getElementById("ctrl-fwd");
  const progress = document.getElementById("ctrl-progress");
  const timeDiv = document.getElementById("ctrl-time");
  const btnPauseReveal = document.getElementById("ctrl-pause-reveal");

  // player meta UI
  const ageBadge = document.getElementById("player-age-badge");
  const playerTitle = document.getElementById("player-title");
  const tvLabel = document.getElementById("player-tv-label");
  const seasonEpi = document.getElementById("player-season-epi");
  const nextCta = document.getElementById("next-ep-cta");

  // Fill meta: read from page elements where we stored them previously
  try {
    ageBadge.textContent = (document.getElementById("edad")?.textContent || "").trim() || "N/A";
    const titleText = (document.getElementById("movie-title-text")?.textContent || "").trim() || "";
    playerTitle.textContent = titleText;
    let sLabel = cardEl?.getAttribute("data-season") || document.getElementById("video1")?.dataset.lastSeason || "";
    let eLabel = cardEl?.getAttribute("data-episode") || document.getElementById("video1")?.dataset.lastEpisode || "";
    if (sLabel && eLabel) seasonEpi.textContent = `S${sLabel} • E${eLabel}`;
    else seasonEpi.textContent = "";
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

  // ensure progress is not tabbable on desktop (so D-pad focuses actual controls)
  try { progress.tabIndex = -1; } catch (e) {}

  // initial focus on play button (for D-pad)
  setTimeout(()=>{ try { btnPlay.focus(); } catch(e) {} }, 120);

  function updatePlayIcon() { btnPlay.textContent = video.paused ? "▶" : "⏸"; }
  function tick() {
    if (!video || !progress) return;
    const dur = video.duration || 0;
    progress.max = isFinite(dur) && dur > 0 ? Math.floor(dur) : 0;
    progress.value = Math.floor(video.currentTime || 0);
    timeDiv.textContent = `${formatTime(video.currentTime || 0)} / ${formatTime(video.duration || 0)}`;
    if (cardEl) {
      try {
        const pct = (dur && dur > 0) ? Math.min(100, Math.round((video.currentTime / dur) * 100)) : 0;
        const inner = cardEl.querySelector(".card-progress-inner");
        if (inner) inner.style.width = pct + "%";
      } catch (e) {}
    }
  }

  // Next-episode detection state
  let nextShown = false;
  let nextCountdown = NEXT_EP_COUNTDOWN_SECS;
  let nextIntervalId = null;
  let creditsStartSec = null;

  // compute creditsStart (use dataset creditsStart if present on card)
  function computeCreditsStart() {
    try {
      if (cardEl && cardEl.dataset && cardEl.dataset.creditsStart) {
        const val = Number(cardEl.dataset.creditsStart || 0);
        if (isFinite(val) && val > 0 && video.duration && val < video.duration) {
          return val;
        }
      }
      if (video.duration && isFinite(video.duration)) {
        const bySec = Math.max(0, video.duration - DEFAULT_CREDITS_SECONDS);
        const byPct = Math.max(0, Math.floor(video.duration * (1 - DEFAULT_CREDITS_PCT)));
        return Math.min(bySec, byPct);
      }
      return null;
    } catch (e) { return null; }
  }

  // Show next ep CTA with countdown
  function showNextCta() {
    if (!nextCta) return;
    // ensure there is a next episode to play
    const nextEpisodeEl = findNextEpisodeElement(cardEl);
    if (!nextEpisodeEl) return;
    nextShown = true;
    nextCountdown = NEXT_EP_COUNTDOWN_SECS;
    nextCta.querySelector(".countdown").textContent = String(nextCountdown);
    nextCta.style.display = "flex";
    nextCta.classList.add("pulsing");
    nextCta.setAttribute("aria-hidden", "false");
    nextCta.tabIndex = 0;
    // keyboard / click handler
    nextCta.onclick = (ev) => {
      ev && ev.preventDefault();
      doPlayNextEpisode(nextEpisodeEl);
    };
    nextCta.onkeydown = (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); doPlayNextEpisode(nextEpisodeEl); }
    };
    // countdown interval
    if (nextIntervalId) clearInterval(nextIntervalId);
    nextIntervalId = setInterval(() => {
      nextCountdown--;
      if (nextCta) nextCta.querySelector(".countdown").textContent = String(Math.max(0, nextCountdown));
      if (nextCountdown <= 0) {
        clearInterval(nextIntervalId); nextIntervalId = null;
        // auto-execute
        doPlayNextEpisode(nextEpisodeEl);
      }
    }, 1000);
  }

  function hideNextCta() {
    if (!nextCta) return;
    nextShown = false;
    nextCta.style.display = "none";
    nextCta.classList.remove("pulsing");
    nextCta.setAttribute("aria-hidden", "true");
    if (nextIntervalId) { clearInterval(nextIntervalId); nextIntervalId = null; }
    nextCta.onclick = null;
    nextCta.onkeydown = null;
  }

  // helper to find next episode element given the current card
  function findNextEpisodeElement(currentCard) {
    try {
      if (!currentCard) {
        return document.querySelector(".episode-btn");
      }
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

  // execute play on next episode element (simulate click + close player)
  async function doPlayNextEpisode(nextEl) {
    try {
      hideNextCta();
      if (!nextEl) {
        if (overlay && overlay._cleanup) overlay._cleanup();
        return;
      }
      // delete saved progress for the current storageId because we've concluded it finished
      try { if (storageId) await idbDelete(storageId); } catch (e) {}
      // reset current card progress and remove 'playing'
      try {
        if (cardEl) {
          const innerPrev = cardEl.querySelector(".card-progress-inner");
          if (innerPrev) innerPrev.style.width = "0%";
          cardEl.classList.remove("playing");
        }
      } catch (e) {}
      // cleanup current player and then click nextEl
      if (overlay && overlay._cleanup) overlay._cleanup();
      // give small delay to allow cleanup
      setTimeout(() => {
        try { nextEl.click(); } catch (e) { console.warn("Could not trigger next episode click", e); }
      }, 180);
    } catch (e) { console.warn(e); }
  }

  // Play/Pause handlers
  btnPlay.onclick = () => {
    if (video.paused) { video.play().catch(()=>{}); startAutoSave(storageId); } else { try { video.pause(); } catch (e) {} saveImmediate(storageId); }
    updatePlayIcon();
  };
  btnRew.onclick = () => { try { video.currentTime = Math.max(0, (video.currentTime || 0) - 10); } catch (e) {} tick(); };
  btnFwd.onclick = () => { try { video.currentTime = Math.min(video.duration || Infinity, (video.currentTime || 0) + 10); } catch (e) {} tick(); };

  progress.oninput = (ev) => { const v = Number(ev.target.value || 0); timeDiv.textContent = `${formatTime(v)} / ${formatTime(video.duration || 0)}`; };
  progress.onchange = (ev) => { try { video.currentTime = Number(ev.target.value || 0); tick(); saveImmediate(storageId); } catch (e) {} };

  video.addEventListener("play", () => { updatePlayIcon(); startAutoSave(storageId); });
  video.addEventListener("pause", () => { updatePlayIcon(); saveImmediate(storageId); });
  video.addEventListener("timeupdate", () => {
    tick();
    try {
      if (!creditsStartSec) creditsStartSec = computeCreditsStart();
      if (creditsStartSec && !nextShown && video.currentTime >= creditsStartSec) {
        showNextCta();
      }
      if (nextShown && creditsStartSec && video.currentTime < (creditsStartSec - 3)) {
        hideNextCta();
      }
    } catch (e) {}
  });
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
    if (nextEl) {
      setTimeout(() => { try { nextEl.click(); } catch (e) {} }, 480);
    } else {
      setTimeout(() => { if (overlay && overlay._cleanup) overlay._cleanup(); }, 400);
    }
  });

  try { await video.play(); } catch (err) { try { video.muted = true; await video.play(); } catch (e) { console.warn("Autoplay failed", e); } }
  updatePlayIcon(); tick();

  // When pause & reveal (back to UI) we must return focus to card and avoid the default blue outline
  btnPauseReveal.onclick = () => {
    try { video.pause(); } catch (e) {}
    saveImmediate(storageId);
    overlay.classList.remove("show"); overlay.style.pointerEvents = "none"; document.body.classList.remove("player-active");
    if (cardEl) {
      setTimeout(() => {
        try {
          // add custom focus class and focus the button (episode card)
          cardEl.classList.add("focused-by-player");
          cardEl.focus({ preventScroll: false });
          cardEl.scrollIntoView({ block: "nearest", inline: "center" });
          // remove class on blur or after timeout
          const onBlurRemove = () => { cardEl.classList.remove("focused-by-player"); cardEl.removeEventListener("blur", onBlurRemove); };
          cardEl.addEventListener("blur", onBlurRemove, { once: true });
          setTimeout(() => { try { cardEl.classList.remove("focused-by-player"); } catch(e) {} }, 4000);
        } catch (e) {}
      }, 90);
    }
  };

  // Overlay keyboard navigation (D-pad) - only active while overlay is open
  // This handler gives left/right circular navigation among visible controls and Enter to activate.
  function overlayKeyHandler(e) {
    const overlayEl = document.getElementById("player-overlay");
    if (!overlayEl || !overlayEl.classList.contains("show")) return;
    // ignore typing
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // list of controls in order (left to right)
    // <-- ADJUSTED: ahora incluimos btnPauseReveal para que pueda recibir focus y ser navegable -->
    const candidates = [btnRew, btnPlay, btnFwd, btnPauseReveal];
    // include nextCta if visible
    if (nextCta && nextCta.offsetParent !== null) candidates.push(nextCta);
    // filter those visible
    const controls = candidates.filter(c => c && c.offsetParent !== null);

    if (!controls.length) {
      // fallback default: Enter toggles play
      if (e.key === "Enter") { e.preventDefault(); try { btnPlay && btnPlay.click(); } catch (err) {} }
      return;
    }

    const active = document.activeElement;
    let idx = controls.indexOf(active);

    // if focus is not on a control, pressing arrows will focus first or last appropriately
    if (idx === -1) {
      if (e.key === "ArrowLeft") { e.preventDefault(); controls[controls.length - 1].focus(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); controls[0].focus(); return; }
      if (e.key === "Enter") { e.preventDefault(); controls[0].focus(); try { controls[0].click(); } catch(e) {} return; }
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = controls[(idx + 1) % controls.length];
      next && next.focus();
      return;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = controls[(idx - 1 + controls.length) % controls.length];
      prev && prev.focus();
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const focused = document.activeElement;
      if (focused && (focused.tagName === "BUTTON" || focused.tagName === "INPUT")) {
        try { focused.click(); } catch (err) {}
      } else {
        try { btnPlay.click(); } catch (err) {}
      }
      return;
    } else if (e.key === "Escape" || e.key === "Backspace") {
      e.preventDefault();
      cleanup(); // close overlay
      return;
    }
  }
  document.addEventListener("keydown", overlayKeyHandler);

  // close with Escape / Backspace (duplicated pero seguro)
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); cleanup(); } };
  document.addEventListener("keydown", onKey);

  function cleanup() {
    try { video.pause(); } catch (e) {}
    try { video.removeAttribute("src"); } catch (e) {}
    if (_hlsInstance && _hlsInstance.destroy) try { _hlsInstance.destroy(); } catch (e) {}
    _hlsInstance = null;
    stopAutoSave();
    if (nextIntervalId) { clearInterval(nextIntervalId); nextIntervalId = null; }
    hideNextCta();
    document.body.classList.remove("player-active");
    overlay.classList.remove("show"); overlay.style.pointerEvents = "none";
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("keydown", overlayKeyHandler);
    // return focus to card (same behavior as pause)
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
/* NOTE: esta sección es adaptada del script original que ya estabas usando. */

function focusElement(el) {
  if (!el) return false;
  try { el.focus(); return true; } catch (e) { return false; }
}

function getTopControlsOrdered() {
  // order: back, play, donar, add, report
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
    // update play pill label if exists
    const pillText = document.getElementById("play-pill-text");
    if (pillText) pillText.textContent = `Play S${sIdx} E${eIdx}`;
    const playBtn = document.getElementById("video1");
    if (playBtn) { playBtn.dataset.lastSeason = String(sIdx); playBtn.dataset.lastEpisode = String(eIdx); }
  } catch (e) {}
}

async function handlePlayButtonAction() {
  // When play pressed: resume most recent or play selected season/episode
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

    // IDB most recent:
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

    // fallback: first episode of selected season (or first overall)
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

/* ---------------- Hydrate UI & logic (igual que tu script) ---------------- */
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

  // year & age & rating: elements expected in markup:
  if ($("#edad")) $("#edad").textContent = entry.edad || "";
  if ($("#year-inline")) $("#year-inline").textContent = entry.año || "";

  /* ---------------------------------------
     New: renderStarsWithNumber -> genera
     estrellas + número (1-10) al lado
     --------------------------------------- */
  function renderStarsWithNumber(containerStars, containerNumber, val) {
    if (!containerStars || !containerNumber) return;
    containerStars.innerHTML = "";
    const rating = Number(val) || 0;
    const clamped = Math.max(0, Math.min(5, rating));
    const p = Math.round(clamped * 2) / 2;
    const completas = Math.floor(p);
    const mitad = p - completas >= 0.5;
    for (let i = 0; i < completas; i++) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star"); containerStars.appendChild(ico);
    }
    if (mitad) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-half"); containerStars.appendChild(ico);
    }
    for (let i = 0; i < 5 - completas - (mitad ? 1 : 0); i++) {
      const ico = document.createElement("ion-icon"); ico.setAttribute("name", "star-outline"); containerStars.appendChild(ico);
    }
    const number10 = Math.round((clamped / 5) * 10 * 10) / 10; // un decimal
    containerNumber.textContent = `${number10.toFixed(1)}`;
  }

  // use new rating helper if containers exist
  const starsContainer = document.querySelector("#puntuacion .stars");
  const ratingNumberEl = document.getElementById("rating-number");
  renderStarsWithNumber(starsContainer, ratingNumberEl, entry.rating || entry.valor || 0);

  // Build seasons structure from JSON ('seasons' preferido)
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

  // --- NEW: populate #seasons-count using entry.temporadas (explicit) with singular/plural wording ---
  try {
    const seasonsCountEl = document.getElementById("seasons-count");
    let seasonsCountValue = null;
    if (entry && Object.prototype.hasOwnProperty.call(entry, 'temporadas')) {
      const parsed = Number(entry.temporadas);
      if (isFinite(parsed) && !isNaN(parsed)) seasonsCountValue = Math.max(0, Math.floor(parsed));
    }
    // fallback: use seasons.length if entry.temporadas not present or invalid
    if (seasonsCountValue === null) seasonsCountValue = seasons.length || 0;

    if (seasonsCountEl) {
      const label = (seasonsCountValue === 1) ? "Temporada" : "Temporadas";
      seasonsCountEl.textContent = `${seasonsCountValue} ${label}`;
    }
  } catch (e) { /* silent */ }

  // description
  const descP = document.querySelector("#descripcion p");
  if (descP) descP.textContent = entry.sinopsis || "";

  // seasons UI
  const seasonsButtons = $("#seasons-buttons");
  const seasonsWrap = $("#seasons-wrap");
  if (!seasonsButtons) { console.warn("No #seasons-buttons container in DOM"); return; }
  seasonsButtons.innerHTML = "";

  // helper: compute gap and card width to scroll
  function getSeasonScrollMetrics() {
    const btn = seasonsButtons.querySelector(".season-btn");
    const gapStyle = getComputedStyle(seasonsButtons).getPropertyValue('gap') || getComputedStyle(seasonsButtons).getPropertyValue('--season-gap') || '0px';
    const gap = parseFloat(gapStyle) || 0;
    const cardW = btn ? btn.offsetWidth : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--season-width')) || 120);
    return { gap, cardW };
  }

  // helper: ensure season index (1-based) is visible and positioned so it becomes the 3rd slot when possible
  function ensureSeasonInViewByIndex(idx1Based, smooth = true) {
    try {
      const total = seasons.length;
      if (!seasonsButtons) return;
      const idx0 = Number(idx1Based) - 1;
      const { gap, cardW } = getSeasonScrollMetrics();
      const step = cardW + gap;
      // desired: if idx0 >= 2, make it appear as the 3rd visible card -> scrollLeft = (idx0 - 2) * step
      let target = 0;
      if (idx0 >= 2 && total > 3) {
        target = Math.max(0, Math.round((idx0 - 2) * step));
      } else {
        // otherwise ensure card is fully visible (min)
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

    // focus handler: ensure in view (so D-pad focusing scrolls properly)
    btn.addEventListener("focus", (ev) => {
      try { ensureSeasonInViewByIndex(s.index, true); } catch(e) {}
    });

    // keyboard handlers for season buttons (left/right/down/up/enter)
    btn.addEventListener("keydown", (e) => {
      const arr = Array.from(document.querySelectorAll(".season-btn"));
      const i = arr.indexOf(btn);
      if (e.key === "ArrowRight") { e.preventDefault(); if (i < arr.length - 1) arr[i+1].focus(); else arr[0].focus(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (i > 0) arr[i-1].focus(); else arr[arr.length-1].focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); const firstEp = document.querySelector(`.episode-btn[data-season="${btn.getAttribute('data-season')}"]`); if (firstEp) firstEp.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); focusElement(document.getElementById("video1")); }
      else if (e.key === "Enter") {
        e.preventDefault();
        // add transition class to episodes-list then render
        try {
          const episodesListEl = document.getElementById("episodes-list");
          if (episodesListEl) {
            episodesListEl.classList.add("updating");
            // small delay for the out-transition
            setTimeout(() => {
              // emulate click behavior
              btn.click();
              // after render allow in transition end
              setTimeout(() => { episodesListEl.classList.remove("updating"); }, 320);
            }, 120);
          } else {
            btn.click();
          }
        } catch (er) { btn.click(); }
        // after Enter, ensure season in view
        setTimeout(() => ensureSeasonInViewByIndex(s.index, true), 180);
      }
    });

    // click handler: select + render episodes (with smooth episodes transition)
    btn.addEventListener("click", () => {
      Array.from(document.querySelectorAll(".season-btn")).forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");

      // ensure season scrolled to correct place
      ensureSeasonInViewByIndex(s.index, true);

      // add updating class on episodes list for transition
      const episodesListEl = document.getElementById("episodes-list");
      if (episodesListEl) episodesListEl.classList.add("updating");
      // give a tiny delay to show transition
      setTimeout(() => {
        renderEpisodesForSeason(btn.getAttribute("data-season"));
        // remove updating after a short delay to allow CSS to animate back in
        setTimeout(() => { if (episodesListEl) episodesListEl.classList.remove("updating"); }, 300);
      }, 110);
    });
  });

  const episodesList = $("#episodes-list");
  if (!episodesList) { console.warn("No #episodes-list in DOM"); return; }

  function renderEpisodesForSeason(seasonIndex) {
    const seasonObj = seasons.find(s => Number(s.index) === Number(seasonIndex));
    if (!seasonObj) { episodesList.innerHTML = `<div style="color:#ddd">No hay episodios.</div>`; return; }

    // update temporada display & description
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

      // credits meta (optional). If present, expose dataset for openPlayer to use
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

      // click -> play
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

      // keyboard navigation for episodes
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
            // go back to selected season
            const sbtn = getSelectedSeasonButton();
            if (sbtn) focusElement(sbtn);
            else focusElement(document.getElementById("video1"));
          } else {
            focusElement(list[idx - 1]);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          // jump to season selected
          const sbtn = getSelectedSeasonButton();
          if (sbtn) focusElement(sbtn);
        } else if (e.key === "Enter") {
          e.preventDefault();
          btn.click();
        }
      });

      episodesList.appendChild(btn);
    });

    // after rendering, set focus to first episode if requested
    setTimeout(() => {
      const first = document.querySelector(`.episode-btn[data-season="${seasonIndex}"]`);
      if (first) first.tabIndex = 0;
    }, 40);
  }

  // initial season selection logic based on saved progress (most recientemente actualizado)
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

  // adjust seasons-wrap scrolling behavior: if <=3 seasons -> no-scroll class (so column doesn't get constrained)
  try {
    if (seasons.length <= 3) {
      if (seasonsWrap) seasonsWrap.classList.add("no-scroll");
    } else {
      if (seasonsWrap) seasonsWrap.classList.remove("no-scroll");
    }
  } catch (e) {}

  // select initial season button and ensure it's visible/focused
  const selBtn = document.querySelector(`.season-btn[data-season="${initialSeasonIdx}"]`);
  if (selBtn) {
    $$(".season-btn").forEach(b => b.classList.remove("selected"));
    selBtn.classList.add("selected");
    // ensure visible (scroll to it if necessary)
    setTimeout(() => { ensureSeasonInViewByIndex(initialSeasonIdx, false); }, 80);
  }

  // render episodes for the initial season
  renderEpisodesForSeason(initialSeasonIdx);

  // After rendering initial episodes, if localStorage says user left on a specific episode, focus it
  setTimeout(() => {
    try {
      const last = localStorage.getItem("series_lastSelection");
      if (last) {
        const parsed = JSON.parse(last);
        if (String(parsed.seriesId) === String(seriesId) && parsed.sIdx && parsed.eIdx) {
          // ensure season selected
          const seasonBtn = document.querySelector(`.season-btn[data-season="${parsed.sIdx}"]`);
          if (seasonBtn) {
            // mark selected and ensure in view
            $$(".season-btn").forEach(b => b.classList.remove("selected"));
            seasonBtn.classList.add("selected");
            ensureSeasonInViewByIndex(parsed.sIdx, true);
          }
          // focus episode button if present
          setTimeout(() => {
            const epBtn = document.querySelector(`.episode-btn[data-season="${parsed.sIdx}"][data-episode="${parsed.eIdx}"]`);
            if (epBtn) {
              try { epBtn.focus(); } catch (e) {}
            } else {
              const firstEp = document.querySelector(`.episode-btn[data-season="${parsed.sIdx}"]`);
              if (firstEp) { try { firstEp.focus(); } catch(e) {} }
            }
          }, 180);
        }
      } else {
        // if no last selection, try to focus first episode of the initial season
        const firstEp = document.querySelector(`.episode-btn[data-season="${initialSeasonIdx}"]`);
        if (firstEp) { try { firstEp.focus(); } catch(e) {} }
      }
    } catch (e) {}
  }, 280);

  // hydrate progress bars with IDB records
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

  // initial play pill label from most recent or first
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

  // Set initial focus to Play button as requested
  setTimeout(() => {
    const playBtn = document.getElementById("video1");
    if (playBtn) focusElement(playBtn);
  }, 120);

  // Install improved D-pad / keyboard handler (global)
  document.addEventListener("keydown", (ev) => {
    // ignore when typing in inputs
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // If player overlay is shown, let overlay handler manage navigation (do not collide)
    const overlayEl = document.getElementById("player-overlay");
    if (overlayEl && overlayEl.classList.contains("show")) return;

    const topControls = getTopControlsOrdered();
    const active = document.activeElement;
    // if focus is on a top control
    if (topControls.includes(active)) {
      // find index
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
        // if current is last (report) and we press right -> jump to first episode of selected season
        const firstEp = (function(){ const sel = getSelectedSeasonButton(); return sel ? document.querySelector(`.episode-btn[data-season="${sel.getAttribute('data-season')}"]`) : document.querySelector(".episode-btn"); })();
        if (firstEp) { focusElement(firstEp); return; }
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        // go to seasons (selected)
        const selSeason = getSelectedSeasonButton();
        if (selSeason) { focusElement(selSeason); return; }
        const firstSeason = document.querySelector(".season-btn");
        if (firstSeason) { focusElement(firstSeason); return; }
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        // activate play button action if it's the play control
        if (active && active.id === "video1") { handlePlayButtonAction(); return; }
        // otherwise click the control
        try { active.click(); } catch (e) {}
      }
      return;
    }

    // If focus is on season-btn or inside seasons container, allow its handlers (they are attached).
    if (active && active.classList && active.classList.contains("season-btn")) {
      // let element-specific handler run (already attached)
      return;
    }

    // If focus is inside episodes list (episode-btn)
    if (active && active.classList && active.classList.contains("episode-btn")) {
      // element-specific handlers already implemented on keydown of episode
      return;
    }

    // Otherwise, fallback: if user presses right, move to first season or first episode etc.
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      const firstSeason = document.querySelector(".season-btn");
      if (firstSeason) { focusElement(firstSeason); return; }
    }
  });

  // Top play button click handler (explicit)
  const playBtn = document.getElementById("video1");
  if (playBtn) {
    playBtn.addEventListener("click", (e) => { e && e.preventDefault(); handlePlayButtonAction(); });
  }

  // FAVORITO / REPORT / DONAR UI actions
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
