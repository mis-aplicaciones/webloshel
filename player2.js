/* player2.js - fixes: playlist nav commit behavior, restore arrows, tooltip removal,
   clearer gaussian for controls, resolution icon larger, menu-bottom moved up,
   improved title glow, and menu autohide suspension while audio dropdown open.
*/

class PlayerJS {
  constructor() {
    // Elements
    this.videoEl = document.getElementById("player-video");
    this.playlistEl = document.getElementById("carouselList");
    this.containerEl = document.getElementById("playlist-container");
    this.spinnerEl = document.getElementById("video-loading-spinner");

    this.menuEl = document.getElementById("tv-menu");
    this.btnClose = document.getElementById("btn-close");
    this.timeText = document.getElementById("tv-menu-time-text");
    this.channelLogo = document.getElementById("channel-logo");
    this.channelTitleEl = document.getElementById("tv-menu-channel-title");
    this.channelNumberEl = document.getElementById("tv-menu-channel-number");

    this.btnPlayPause = document.getElementById("btn-playpause");
    this.iconPlayPause = document.getElementById("icon-playpause");
    this.btnAudio = document.getElementById("btn-audio");
    this.audioLabel = document.getElementById("audio-label");
    this.btnGuide = document.getElementById("btn-guide");
    this.btnRes = document.getElementById("btn-res");
    this.iconRes = document.getElementById("icon-res");

    this.tooltipEl = document.getElementById("tv-menu-tooltip");

    this.audioDropdown = document.getElementById("audio-dropdown");
    this.audioOptions = Array.from(document.querySelectorAll('#audio-dropdown .audio-opt'));

    // DVR placeholders
    this.dvrContainer = document.getElementById("dvr-container");
    this.dvrProgress = document.getElementById("dvr-progress");
    this.dvrKnob = document.getElementById("dvr-knob");

    // State
    this.hls = null;
    this.shakaPlayer = null;
    this.playlist = [];
    this.currentIndex = 0;     // index used by UI (navigating)
    this.playbackIndex = 0;    // index actually playing
    this.hasUncommittedNav = false;

    // timers
    this.menuTimer = null;
    this.menuTimeoutMs = 5000;
    this.playlistTimer = null;
    this.playlistTimeoutMs = 5000;

    // start with volume (best-effort)
    try { this.videoEl.muted = false; this.videoEl.volume = 1.0; } catch(e){}

    this.init();
  }

  init() {
    this.updateClock();
    setInterval(()=>this.updateClock(), 60000);

    this.addUIListeners();
    this.initMenuActions();

    // render playlist structure but keep hidden
    this.renderCarousel();
    this.updateCarousel(false);

    setTimeout(()=> this.tryAutoplay(), 120);
    this.monitorPlayback();

    // playlist interaction resets autohide
    this.containerEl.addEventListener('mousemove', ()=> this.resetPlaylistTimer());
    this.containerEl.addEventListener('click', ()=> this.resetPlaylistTimer());
    this.containerEl.addEventListener('touchstart', ()=> this.resetPlaylistTimer());
  }

  tryAutoplay() {
    const tryPlay = () => this.videoEl.play().then(()=> true).catch(()=> false);
    tryPlay().then(ok => {
      if (!ok) {
        try { this.videoEl.muted = true; } catch(e){}
        tryPlay().then(ok2 => {
          if (ok2) this.iconPlayPause.className = 'bi bi-pause-fill';
          else this.iconPlayPause.className = 'bi bi-play-fill';
        });
      } else {
        this.iconPlayPause.className = 'bi bi-pause-fill';
      }
    });
  }

  updateClock() {
    const d = new Date();
    let h = d.getHours() % 12; if (h === 0) h = 12;
    const m = String(d.getMinutes()).padStart(2,'0');
    this.timeText.textContent = `${h}:${m}`;
  }

  /* ------------------ MENU ACTIONS ------------------ */
  initMenuActions() {
    // CLOSE
    this.btnClose.addEventListener('click', ()=> {
      try { history.back(); } catch(e) { this.hideMenu(); }
    });

    // PLAY/PAUSE
    this.btnPlayPause.addEventListener('click', ()=> {
      if (this.videoEl.paused) {
        this.videoEl.play().catch(()=>{});
        this.iconPlayPause.className = 'bi bi-pause-fill';
      } else {
        this.videoEl.pause();
        this.iconPlayPause.className = 'bi bi-play-fill';
      }
      this.resetMenuTimer();
    });

    // AUDIO dropdown open/close
    this.btnAudio.addEventListener('click', ()=> {
      if (this.audioDropdown.classList.contains('hidden')) this.openAudioDropdown();
      else this.closeAudioDropdown();
    });

    // GUIDE -> open playlist and ensure tv-menu is hidden
    this.btnGuide.addEventListener('click', ()=> {
      this.openPlaylistFromMenu();
    });

    // RES tooltip
    this.btnRes.addEventListener('click', ()=> {
      const isHd = (this.videoEl.videoHeight || 0) >= 720;
      this.showTempTooltip(isHd ? 'HD' : 'SD', 900);
      this.resetMenuTimer();
    });

    // remove automatic tooltip-on-focus to avoid the titles appearing while navigating
    // (we keep manual tooltip calls for brief messages like resolution)
  }

  /* ------------------ AUDIO DROPDOWN (focus trap + menu-timer suspend) ------------------ */
  openAudioDropdown() {
    // populate labels best-effort
    let labels = [];
    try {
      if (this.hls && this.hls.audioTracks && this.hls.audioTracks.length) labels = this.hls.audioTracks.map(t => (t.lang || t.name || '').toUpperCase());
      else if (this.videoEl.audioTracks && this.videoEl.audioTracks.length) {
        const at = this.videoEl.audioTracks;
        for (let i=0;i<at.length;i++) labels.push((at[i].language || at[i].label || `P${i+1}`).toUpperCase());
      }
    } catch(e){}
    if (!labels.length) labels = ['ENG','SPA'];

    const opts = Array.from(this.audioDropdown.querySelectorAll('.audio-opt'));
    opts.forEach((opt,i) => {
      opt.textContent = labels[i] || (`P${i+1}`);
      opt.dataset.val = i;
      opt.tabIndex = -1;
    });

    // show dropdown and blur menu+playlist (not player)
    this.audioDropdown.classList.remove('hidden');
    document.body.classList.add('controls-blur');
    this.audioDropdown.setAttribute('aria-hidden','false');

    // suspend menu autohide while dropdown open
    this.clearMenuTimer();

    // focus option matching current audio label
    const curLabel = (this.audioLabel.textContent || '').toUpperCase();
    let focusIdx = 0;
    opts.forEach((opt,i) => { if (opt.textContent && opt.textContent.toUpperCase() === curLabel) focusIdx = i; });

    setTimeout(()=> {
      opts.forEach(o => o.tabIndex = -1);
      const toFocus = opts[focusIdx] || opts[0];
      if (toFocus) { toFocus.tabIndex = 0; toFocus.focus(); }
    }, 30);

    // attach keyboard trap (handled in global keydown)
  }

  closeAudioDropdown() {
    this.audioDropdown.classList.add('hidden');
    document.body.classList.remove('controls-blur');
    this.audioDropdown.setAttribute('aria-hidden','true');

    // resume menu timer
    this.resetMenuTimer();

    this.safeFocus(this.btnAudio);
  }

  selectAudioOption(idx) {
    try {
      if (this.hls && typeof this.hls.audioTrack === 'number') {
        this.hls.audioTrack = idx;
        const t = this.hls.audioTracks && this.hls.audioTracks[idx];
        this.audioLabel.textContent = (t && (t.lang || t.name)) ? (t.lang || t.name).toUpperCase() : (idx===0?'ENG':'SPA');
      } else if (this.videoEl.audioTracks && this.videoEl.audioTracks.length) {
        const at = this.videoEl.audioTracks;
        for (let i=0;i<at.length;i++) at[i].enabled = (i===idx);
        this.audioLabel.textContent = (at[idx].language || at[idx].label || (`P${idx+1}`)).toUpperCase();
      } else {
        this.audioLabel.textContent = idx===0 ? 'ENG' : 'SPA';
      }
    } catch(e) { console.warn('selectAudioOption', e); }

    this.closeAudioDropdown();
  }

  /* ------------------ MENU show/hide and autohide ------------------ */
  resetMenuTimer() {
    clearTimeout(this.menuTimer);
    // if audio dropdown is open, suspend autohide
    if (this.audioDropdown && !this.audioDropdown.classList.contains('hidden')) return;
    this.menuTimer = setTimeout(()=> this.hideMenu(), this.menuTimeoutMs);
  }
  clearMenuTimer() { clearTimeout(this.menuTimer); this.menuTimer = null; }

  showMenu() {
    const cur = this.playlist[this.playbackIndex] || {};
    this.channelLogo.src = cur.image || '';
    this.channelTitleEl.textContent = cur.title || '';
    this.channelNumberEl.textContent = cur.number || '';
    this.updateResolutionIcon();
    this.menuEl.classList.remove('hidden');
    this.menuEl.setAttribute('aria-hidden','false');
    this.safeFocus(this.btnPlayPause);
    this.resetMenuTimer();
  }

  hideMenu() {
    // don't hide if audio dropdown open
    if (this.audioDropdown && !this.audioDropdown.classList.contains('hidden')) return;
    this.menuEl.classList.add('hidden');
    this.menuEl.setAttribute('aria-hidden','true');
    this.clearMenuTimer();
  }

  /* ------------------ PLAYLIST behavior (navigation vs commit) ------------------ */
  openPlaylistFromMenu() {
    // hide menu to avoid overlap
    this.hideMenu();

    // ensure playlist UI centers on currently playing channel,
    // unless user had uncommitted navigation active (we prefer to show playing channel)
    this.currentIndex = this.playbackIndex;
    this.hasUncommittedNav = false;

    this.renderCarousel();
    this.updateCarousel(false);

    this.containerEl.classList.add('active');
    this.containerEl.setAttribute('aria-hidden','false');

    setTimeout(()=> {
      const centerIdx = Math.floor(this.playlistEl.children.length / 2);
      const centerItem = this.playlistEl.children[centerIdx];
      if (centerItem) {
        const btn = centerItem.querySelector('.carousel-button');
        if (btn) { btn.tabIndex = 0; btn.focus(); }
      }
    }, 80);

    this.resetPlaylistTimer();
  }

  resetPlaylistTimer() {
    clearTimeout(this.playlistTimer);
    this.playlistTimer = setTimeout(()=> this.hidePlaylist(), this.playlistTimeoutMs);
  }
  stopPlaylistTimer() { clearTimeout(this.playlistTimer); this.playlistTimer = null; }

  hidePlaylist() {
    // If user navigated but didn't execute, discard uncommitted nav and center on playbackIndex
    if (this.hasUncommittedNav) {
      this.currentIndex = this.playbackIndex;
      this.hasUncommittedNav = false;
      this.renderCarousel(); this.updateCarousel(false);
    }
    this.containerEl.classList.remove('active');
    this.containerEl.setAttribute('aria-hidden','true');
    this.stopPlaylistTimer();
  }

  safeFocus(el) { try { if (el && typeof el.focus === 'function') el.focus(); } catch(e){} }

  /* ------------------ PLAYLIST render & nav ------------------ */
  loadPlaylist(arr) {
    this.playlist = arr;
    this.currentIndex = 0;
    this.playbackIndex = 0;
    this.hasUncommittedNav = false;
    this.renderCarousel();
    this.updateCarousel(false);
    // play first channel automatically
    this.playCurrent();
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

    // click = commit the selection (play)
    item.addEventListener("click", () => {
      this.currentIndex = idx;
      this.play();         // play will update playbackIndex and UI
      this.hidePlaylist();
    });
    item.addEventListener("touchend", e => {
      e.preventDefault();
      this.currentIndex = idx;
      this.play();
      this.hidePlaylist();
    });

    return item;
  }

  renderCarousel() {
    const N = this.playlist.length || 1;
    this.playlistEl.innerHTML = "";
    // show 7 items centered on currentIndex
    const half = 3;
    for (let off = -half; off <= half; off++) {
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
    const half = 3;
    const baseY = wrapH / 2 - itemH / 2 - half * itemH;

    this.playlistEl.style.transition = animate ? "transform .3s ease" : "none";
    this.playlistEl.style.transform = `translateY(${baseY}px)`;

    Array.from(items).forEach((el, i) => {
      el.classList.toggle("focused", i === half);
    });

    if (!animate) { void this.playlistEl.offsetWidth; this.playlistEl.style.transition = "transform .3s ease"; }
  }

  // navigation inside playlist: update only UI (uncommitted)
  move(dir) {
    const N = this.playlist.length;
    if (!N) return;
    this.currentIndex = (this.currentIndex + dir + N) % N;
    this.hasUncommittedNav = true;
    this.renderCarousel();
    this.updateCarousel(true);
  }

  /* ------------------ PLAYBACK (HLS/Shaka/fallback) ------------------ */
  playCurrent() {
    // play the currently selected playbackIndex
    const f = this.playlist[this.playbackIndex] || {};
    // update UI info
    try {
      this.channelLogo.src = f.image || '';
      this.channelTitleEl.textContent = f.title || '';
      this.channelNumberEl.textContent = f.number || '';
    } catch(e){}

    // destroy previous instances
    if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; }
    if (this.shakaPlayer) { try { this.shakaPlayer.destroy(); } catch(e){} this.shakaPlayer = null; }

    const url = (f.file || "").trim();
    const isM3U8 = /\.m3u8($|\?)/i.test(url);
    this.spinnerEl.classList.remove('hidden');

    if (isM3U8 && window.Hls && Hls.isSupported()) {
      try {
        this.hls = new Hls({ maxBufferLength:30, liveSyncDurationCount:3, enableWorker:true, xhrSetup:(xhr)=>{ try{ xhr.withCredentials=false; }catch(e){} } });
      } catch(e) { this.hls = null; }

      if (this.hls) {
        const self = this;
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          try { this.videoEl.muted = false; this.videoEl.volume = 1.0; } catch(e){}
          try { this.videoEl.play().catch(()=>{}); } catch(e){}
          this.spinnerEl.classList.add('hidden');
          this.iconPlayPause.className = 'bi bi-pause-fill';
          setTimeout(()=>{ this.updateResolutionIcon(); this.updateAudioLabel(); }, 300);
        });
        this.hls.on(Hls.Events.ERROR, function(event,data){
          if (data && data.fatal) { try { self.hls.recoverMediaError(); } catch(e){} }
        });

        try { this.hls.loadSource(url); this.hls.attachMedia(this.videoEl); } catch(e){
          try { this.hls.destroy(); } catch(e){}
          this.hls = null;
          try { this.videoEl.src = url; this.videoEl.play().catch(()=>{}); } catch(e){}
          this.spinnerEl.classList.add('hidden');
        }
        return;
      }
    }

    if (isM3U8 && this.videoEl.canPlayType && this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      try { this.videoEl.src = url; } catch(e){}
      this.videoEl.addEventListener('loadedmetadata', ()=> {
        try { this.videoEl.play().catch(()=>{}); } catch(e){}
        this.spinnerEl.classList.add('hidden');
        this.iconPlayPause.className = 'bi bi-pause-fill';
        setTimeout(()=>{ this.updateResolutionIcon(); this.updateAudioLabel(); }, 300);
      }, { once:true });
      return;
    }

    if (window.shaka && shaka.Player.isBrowserSupported()) {
      try {
        this.shakaPlayer = new shaka.Player(this.videoEl);
        this.shakaPlayer.load(url).then(()=> {
          this.videoEl.play().catch(()=>{});
          this.spinnerEl.classList.add('hidden'); this.iconPlayPause.className='bi bi-pause-fill';
          this.updateResolutionIcon(); this.updateAudioLabel();
        }).catch(err=>{
          try { this.videoEl.src = url; this.videoEl.play().catch(()=>{}); } catch(e){}
          this.spinnerEl.classList.add('hidden');
        });
        return;
      } catch(e){}
    }

    try { this.videoEl.src = url; this.videoEl.play().catch(()=>{}); this.iconPlayPause.className='bi bi-pause-fill'; } catch(e){}
    finally { this.spinnerEl.classList.add('hidden'); this.updateResolutionIcon(); this.updateAudioLabel(); }
  }

  // called when user confirms selection (play)
  playCurrentSelection() {
    // commit UI currentIndex into playbackIndex and start playback
    this.playbackIndex = this.currentIndex;
    this.hasUncommittedNav = false;
    this.playCurrent();
  }

  // convenience wrapper used by UI when clicking an item
  play() {
    // when called (via playlist item click), set playbackIndex and play
    this.playbackIndex = this.currentIndex;
    this.hasUncommittedNav = false;
    this.playCurrent();
    this.renderCarousel(); this.updateCarousel(false);
  }

  updateResolutionIcon() {
    try {
      const isHd = (this.videoEl.videoHeight || 0) >= 720;
      if (isHd) this.iconRes.classList.add('hd'); else this.iconRes.classList.remove('hd');
    } catch(e){}
  }

  updateAudioLabel() {
    try {
      if (this.hls && this.hls.audioTracks && typeof this.hls.audioTrack === 'number') {
        const idx = this.hls.audioTrack || 0;
        const t = this.hls.audioTracks[idx];
        this.audioLabel.textContent = (t && (t.lang || t.name)) ? (t.lang || t.name).toUpperCase() : (idx===0 ? 'ENG' : 'SPA');
        return;
      }
      const at = this.videoEl.audioTracks;
      if (at && at.length) {
        for (let i=0;i<at.length;i++) if (at[i].enabled) { this.audioLabel.textContent = (at[i].language||at[i].label||'ENG').toUpperCase(); return; }
        this.audioLabel.textContent = (at[0].language||at[0].label||'ENG').toUpperCase();
        return;
      }
      this.audioLabel.textContent = 'ENG';
    } catch(e){}
  }

  monitorPlayback() {
    let last = -1;
    setInterval(()=> {
      if (!this.videoEl.paused && !this.videoEl.ended) {
        if (this.videoEl.currentTime === last) this.playCurrent(); // if stalls reinit
        last = this.videoEl.currentTime;
      }
      this.updateResolutionIcon();
    }, 5000);
  }

  /* ------------------ UI listeners & navigation ------------------ */
  addUIListeners() {
    ['mousemove','click','touchstart'].forEach(ev => {
      window.addEventListener(ev, () => {
        if (this.containerEl.classList.contains('active')) { this.resetPlaylistTimer(); return; }
        this.showMenu();
      }, { passive:true });
    });

    window.addEventListener('keydown', (e) => {
      const key = e.key;
      const code = e.keyCode;

      // block default navigation keys we use
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape'].includes(key) || [32].includes(code)) {
        e.preventDefault();
      }

      // Channel up/down (special keys)
      if (key === 'ChannelUp' || code === 33) { this.move(-1); this.playCurrentSelection(); this.showMenu(); return; }
      if (key === 'ChannelDown' || code === 34) { this.move(1); this.playCurrentSelection(); this.showMenu(); return; }

      // If audio dropdown open => trap keys (up/down/enter/escape)
      if (!this.audioDropdown.classList.contains('hidden')) { this.handleAudioDropdownKey(key); return; }

      // If menu visible => route to menu nav
      if (this.menuEl && !this.menuEl.classList.contains('hidden')) { this.handleMenuKey(key); return; }

      // If playlist active => route to playlist nav
      if (this.containerEl.classList.contains('active')) {
        if (key === 'ArrowUp') { this.move(-1); this.resetPlaylistTimer(); }
        else if (key === 'ArrowDown') { this.move(1); this.resetPlaylistTimer(); }
        else if (key === 'Enter') { this.play(); this.hidePlaylist(); }
        return;
      }

      // If hidden & ArrowLeft -> show menu
      if (key === 'ArrowLeft') { this.showMenu(); return; }
    });

    window.addEventListener('wheel', (e)=> {
      if (!this.containerEl.classList.contains('active')) return;
      e.preventDefault();
      this.move(e.deltaY > 0 ? 1 : -1);
      this.resetPlaylistTimer();
    });

    this.videoEl.addEventListener('waiting', ()=> this.spinnerEl.classList.remove('hidden'));
    this.videoEl.addEventListener('playing', ()=> this.spinnerEl.classList.add('hidden'));
    this.videoEl.addEventListener('error', ()=> this.playCurrent());
  }

  handleMenuKey(key) {
    const active = document.activeElement;

    // CLOSE button behavior
    if (active === this.btnClose) {
      if (key === 'ArrowDown') { this.safeFocus(this.btnPlayPause); return; }
      if (key === 'Enter') { this.btnClose.click(); return; }
      return;
    }

    // PLAY/PAUSE
    if (active === this.btnPlayPause) {
      if (key === 'ArrowRight') { this.safeFocus(this.btnAudio); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnPlayPause.click(); return; }
      return;
    }

    // AUDIO
    if (active === this.btnAudio) {
      if (key === 'ArrowRight') { this.safeFocus(this.btnGuide); return; }
      if (key === 'ArrowLeft') { this.safeFocus(this.btnPlayPause); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnAudio.click(); return; }
      return;
    }

    // GUIDE
    if (active === this.btnGuide) {
      if (key === 'ArrowLeft') { this.safeFocus(this.btnAudio); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnGuide.click(); return; }
      return;
    }

    // fallback: Enter triggers click
    if (key === 'Enter' && active && active.click) active.click();
  }

  handleAudioDropdownKey(key) {
    const opts = Array.from(this.audioDropdown.querySelectorAll('.audio-opt'));
    if (!opts.length) return;
    const focused = document.activeElement;
    let idx = opts.indexOf(focused);
    if (idx === -1) idx = 0;

    if (key === 'ArrowDown') {
      if (idx < opts.length - 1) idx++;
      opts[idx].focus(); return;
    }
    if (key === 'ArrowUp') {
      if (idx > 0) idx--;
      opts[idx].focus(); return;
    }
    if (key === 'Enter') { opts[idx].click(); return; }
    if (key === 'Escape') { this.closeAudioDropdown(); return; }
    // ignore left/right to prevent focus escape
  }

  showTempTooltip(text, ttl=1000) {
    this.tooltipEl.textContent = text;
    this.tooltipEl.classList.remove('hidden');
    this.tooltipEl.classList.add('visible');
    setTimeout(()=> {
      this.tooltipEl.classList.add('hidden');
      this.tooltipEl.classList.remove('visible');
    }, ttl);
  }

  /* Touch drag preserved for playlist */
  initTouchDrag() {
    const wrapper = this.containerEl.querySelector(".carousel-wrapper");
    const listEl  = this.playlistEl;
    let itemH, baseY;

    const recalc = () => {
      const first = listEl.children[0];
      if (!first) return;
      const st = getComputedStyle(first);
      itemH = first.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
      const wrapH = wrapper.clientHeight;
      baseY = wrapH / 2 - itemH / 2 - 3 * itemH;
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
      const steps  = Math.round(-deltaY / (itemH || 1));
      if (steps !== 0) this.move(steps);
      listEl.style.transition = "transform .3s ease";
      listEl.style.transform = `translateY(${baseY}px)`;
      this.resetPlaylistTimer();
    });
  }
}

/* ------------------ Inicialización ------------------ */
document.addEventListener('DOMContentLoaded', () => {
  const player = new PlayerJS();

  // Carga completa de playlist (pega aquí tu arreglo original completo)
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
    }
    // ... pega el resto de tus canales aquí
  ]);
});
