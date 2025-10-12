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

    // DVR placeholders (may not be in DOM but safe)
    this.dvrContainer = document.getElementById("dvr-container");
    this.dvrProgress = document.getElementById("dvr-progress");
    this.dvrKnob = document.getElementById("dvr-knob");

    // state
    this.hls = null;
    this.shakaPlayer = null;
    this.playlist = [];
    this.currentIndex = 0;     // UI navigation index
    this.playbackIndex = 0;    // actually playing index
    this.hasUncommittedNav = false;

    // timers
    this.menuTimer = null;
    this.menuTimeoutMs = 5000;
    this.playlistTimer = null;
    this.playlistTimeoutMs = 5000;

    // HLS recovery
    this.hlsRecoverAttempts = 0;
    this.maxHlsRecover = 3;

    // Try to start with volume enabled
    try { this.videoEl.muted = false; this.videoEl.volume = 1.0; } catch(e){}

    this.init();
  }

  init() {
    this.updateClock();
    setInterval(()=>this.updateClock(), 60000);

    this.addUIListeners();
    this.initMenuActions();
    this.initTouchDrag();

    // Render playlist skeleton and keep hidden
    this.renderCarousel();
    this.updateCarousel(false);

    setTimeout(()=> this.tryAutoplay(), 120);
    this.monitorPlayback();

    // Ensure menu interactions reset menu timer
    ["mousemove","click","touchstart","focusin","keydown"].forEach(ev => {
      this.menuEl.addEventListener(ev, () => this.resetMenuTimer(), { passive:true });
    });

    // Also reset timer if user interacts with the bottom controls area (safer)
    const bottom = this.menuEl.querySelector('.tv-menu-bottom');
    if (bottom) {
      ["mousemove","click","touchstart","focusin"].forEach(ev => bottom.addEventListener(ev, () => this.resetMenuTimer(), { passive:true }));
    }

    // playlist interactions reset its timer
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
    // Close
    this.btnClose.addEventListener('click', ()=> {
      try { history.back(); } catch(e) { this.hideMenu(); }
    });

    // Play / Pause
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

    // Audio button toggles dropdown
    this.btnAudio.addEventListener('click', ()=> {
      if (this.audioDropdown.classList.contains('hidden')) this.openAudioDropdown();
      else this.closeAudioDropdown();
    });

    // Guide button -> open playlist and hide menu (no overlap)
    this.btnGuide.addEventListener('click', ()=> {
      this.openPlaylistFromMenu();
    });

    // RES quick tooltip
    this.btnRes.addEventListener('click', ()=> {
      const isHd = (this.videoEl.videoHeight || 0) >= 720;
      this.showTempTooltip(isHd ? 'HD' : 'SD', 900);
      this.resetMenuTimer();
    });

    // attach audio option click listeners (initial)
    this.attachAudioOptionListeners();
  }

  attachAudioOptionListeners() {
    // defensive: remove old listeners by cloning nodes
    const opts = Array.from(this.audioDropdown.querySelectorAll('.audio-opt'));
    opts.forEach(opt => {
      const clone = opt.cloneNode(true);
      opt.parentNode.replaceChild(clone, opt);
    });
    // attach new listeners
    const newOpts = Array.from(this.audioDropdown.querySelectorAll('.audio-opt'));
    newOpts.forEach(opt => {
      opt.addEventListener('click', (ev) => {
        ev.preventDefault();
        const idx = Number(opt.dataset.val || 0);
        this.selectAudioOption(idx);
      });
    });
  }

  /* ------------------ AUDIO DROPDOWN ------------------ */
  openAudioDropdown() {
    // try to populate languages dynamically
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

    // (re)attach listeners defensively
    this.attachAudioOptionListeners();

    // show dropdown and blur menu+playlist (not player video)
    this.audioDropdown.classList.remove('hidden');
    document.body.classList.add('controls-blur');
    this.audioDropdown.setAttribute('aria-hidden','false');

    // suspend menu autohide while dropdown open
    this.clearMenuTimer();

    // focus the option matching current audio label
    const curLabel = (this.audioLabel.textContent || '').toUpperCase();
    let focusIdx = 0;
    opts.forEach((opt,i) => { if (opt.textContent && opt.textContent.toUpperCase() === curLabel) focusIdx = i; });

    // set tabindex and focus reliably
    setTimeout(()=> {
      const updatedOpts = Array.from(this.audioDropdown.querySelectorAll('.audio-opt'));
      updatedOpts.forEach(o => { o.tabIndex = -1; o.classList.remove('selected-focus'); });
      const toFocus = updatedOpts[focusIdx] || updatedOpts[0];
      if (toFocus) {
        toFocus.tabIndex = 0;
        toFocus.focus();
        // style: add class so it's immediately visible if browser focus styles delayed
        toFocus.classList.add('selected-focus');
        // remove helper class after short timeout (native focus handles style)
        setTimeout(()=> toFocus.classList.remove('selected-focus'), 400);
      }
    }, 40);
  }

  closeAudioDropdown() {
    this.audioDropdown.classList.add('hidden');
    document.body.classList.remove('controls-blur');
    this.audioDropdown.setAttribute('aria-hidden','true');

    // resume menu timer
    this.resetMenuTimer();

    // return focus to audio button
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
        this.audioLabel.textContent = (idx===0 ? 'ENG' : 'SPA');
      }
    } catch(e) { console.warn('selectAudioOption', e); }

    this.closeAudioDropdown();
  }

  /* ------------------ MENU show/hide and autohide ------------------ */
  resetMenuTimer() {
    clearTimeout(this.menuTimer);
    // If audio dropdown open, suspend autohide.
    if (this.audioDropdown && !this.audioDropdown.classList.contains('hidden')) return;
    // keep visible while user interacts: set timer to hide after inactivity
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

  /* ------------------ PLAYLIST open/close ------------------ */
  openPlaylistFromMenu() {
    // hide menu first to avoid overlay overlap
    this.hideMenu();

    // center on playing channel
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

    // Create logo area (centered, responsive)
    const logoWrap = document.createElement("div");
    logoWrap.className = "logo-area";
    const img = document.createElement("img");
    img.src = data.image || "";
    img.alt = data.title || "";
    logoWrap.appendChild(img);

    const btn = document.createElement("button");
    btn.className = "carousel-button";
    btn.textContent = data.title || "";

    item.append(lbl, logoWrap, btn);

    item.addEventListener("click", () => {
      this.currentIndex = idx;
      this.play(); // commit
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
    const f = this.playlist[this.playbackIndex] || {};
    try {
      this.channelLogo.src = f.image || '';
      this.channelTitleEl.textContent = f.title || '';
      this.channelNumberEl.textContent = f.number || '';
    } catch(e){}

    // destroy previous players
    if (this.hls) { try { this.hls.destroy(); } catch(e){} this.hls = null; this.hlsRecoverAttempts = 0; }
    if (this.shakaPlayer) { try { this.shakaPlayer.destroy(); } catch(e){} this.shakaPlayer = null; }

    const url = (f.file || "").trim();
    const isM3U8 = /\.m3u8($|\?)/i.test(url);
    this.spinnerEl.classList.remove('hidden');

    if (isM3U8 && window.Hls && Hls.isSupported()) {
      try {
        this.hls = new Hls({
          maxBufferLength: 30,
          liveSyncDurationCount: 3,
          enableWorker: true,
          xhrSetup: (xhr)=> { try { xhr.withCredentials = false; } catch(e){} }
        });
      } catch(e) { this.hls = null; }

      if (this.hls) {
        const self = this;
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          try { this.videoEl.muted = false; this.videoEl.volume = 1.0; } catch(e){}
          this.videoEl.play().catch(()=>{});
          this.spinnerEl.classList.add('hidden');
          this.iconPlayPause.className = 'bi bi-pause-fill';
          setTimeout(()=>{ this.updateResolutionIcon(); this.updateAudioLabel(); }, 300);
          self.hlsRecoverAttempts = 0;
        });

        this.hls.on(Hls.Events.ERROR, function(event,data){
          console.warn("Hls error", data);
          if (!data) return;
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              try { self.hls.recoverMediaError(); } catch(e) { console.warn(e); }
            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              try { self.hls.startLoad(); } catch(e) { console.warn(e); }
            } else {
              // Try reloading a few times then fallback
              if (self.hlsRecoverAttempts < self.maxHlsRecover) {
                self.hlsRecoverAttempts++;
                try { self.hls.stopLoad(); } catch(e){}
                setTimeout(()=> {
                  try { self.hls.startLoad(); } catch(e){ console.warn(e); }
                }, 700);
              } else {
                try { self.hls.destroy(); } catch(e){}
                self.hls = null;
                try { self.videoEl.src = url; self.videoEl.play().catch(()=>{}); } catch(e){}
                self.spinnerEl.classList.add('hidden');
              }
            }
          }
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

  play() {
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
        if (this.videoEl.currentTime === last) {
          // try a soft reinit
          try { this.updateResolutionIcon(); } catch(e){}
        }
        last = this.videoEl.currentTime;
      }
      this.updateResolutionIcon();
    }, 4000);
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

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape'].includes(key) || [32].includes(code)) {
        e.preventDefault();
      }

      // Channel up/down special keys
      if (key === 'ChannelUp' || code === 33) { this.move(-1); this.play(); this.showMenu(); return; }
      if (key === 'ChannelDown' || code === 34) { this.move(1); this.play(); this.showMenu(); return; }

      // If audio dropdown open -> trap
      if (this.audioDropdown && !this.audioDropdown.classList.contains('hidden')) { this.handleAudioDropdownKey(key); return; }

      // Menu navigation
      if (this.menuEl && !this.menuEl.classList.contains('hidden')) { this.handleMenuKey(key); return; }

      // Playlist navigation
      if (this.containerEl.classList.contains('active')) {
        if (key === 'ArrowUp') { this.move(-1); this.resetPlaylistTimer(); }
        else if (key === 'ArrowDown') { this.move(1); this.resetPlaylistTimer(); }
        else if (key === 'Enter') { this.play(); this.hidePlaylist(); }
        return;
      }

      // If hidden & ArrowLeft -> show menu
      // si el menú está oculto, mostrarlo con cualquier flecha del D-pad
if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) {
  this.showMenu();
  return;
}

    });

    window.addEventListener('wheel', (e)=> {
      if (!this.containerEl.classList.contains('active')) return;
      e.preventDefault();
      this.move(e.deltaY > 0 ? 1 : -1);
      this.resetPlaylistTimer();
    });

    this.videoEl.addEventListener('waiting', ()=> this.spinnerEl.classList.remove('hidden'));
    this.videoEl.addEventListener('playing', ()=> this.spinnerEl.classList.add('hidden'));
    this.videoEl.addEventListener('error', ()=> {
      // try small recovery
      try { if (this.hls) this.hls.startLoad(); else this.playCurrent(); } catch(e){ this.playCurrent(); }
    });
  }

  handleMenuKey(key) {
    const active = document.activeElement;

    if (active === this.btnClose) {
      if (key === 'ArrowDown') { this.safeFocus(this.btnPlayPause); return; }
      if (key === 'Enter') { this.btnClose.click(); return; }
      return;
    }

    if (active === this.btnPlayPause) {
      if (key === 'ArrowRight') { this.safeFocus(this.btnAudio); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnPlayPause.click(); return; }
      return;
    }

    if (active === this.btnAudio) {
      if (key === 'ArrowRight') { this.safeFocus(this.btnGuide); return; }
      if (key === 'ArrowLeft') { this.safeFocus(this.btnPlayPause); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnAudio.click(); return; }
      return;
    }

    if (active === this.btnGuide) {
      if (key === 'ArrowLeft') { this.safeFocus(this.btnAudio); return; }
      if (key === 'ArrowUp') { this.safeFocus(this.btnClose); return; }
      if (key === 'Enter') { this.btnGuide.click(); return; }
      return;
    }

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
    // ignore left/right to avoid focus escape
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

  /* ------------------ Touch drag for playlist ------------------ */
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
      image: "img/CANAL-H.png",
      title: "HISTORY",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/HISTORY/index.m3u8"
    }
    ,
    {
      number: "126",
      image: "img/CANAL-DISCOVERY.png",
      title: "DISCOVERY",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/DISCOVERY/index.m3u8"
    }
    ,
    {
      number: "127",
      image: "img/CANAL-PALMERASTV.png",
      title: "PALMERAS TV",
      file:
        "https://play.agenciastreaming.com:8081/palmerastv/index.m3u8"
    }
    ,
    {
      number: "128",
      image: "img/CANAL-MEGATV.png",
      title: "MEGA TV",
      file:
        "https://mc.servidor.stream:19360/megatv/megatv.m3u8"
    }
    ,
    {
      number: "129",
      image: "img/CANAL-AMERICATV.png",
      title: "AMERICA TV",
      file:
        "http://181.188.216.5:18000/play/a014/index.m3u8"
    }
    ,
    {
      number: "130",
      image: "img/CANAL ATV.png",
      title: "ATV",
      file:
        "https://alba-pe-atv-atv.stream.mediatiquestream.com/index.m3u8"
    },
    {
      number: "131",
      image: "img/CANAL-SONYCHANNEL.png",
      title: "SONY CHANNEL",
      file:
        "https://fl25.moveonjoy.com/Sony_Movie_Channel/index.m3u8"
    }
    ,
    {
      number: "132",
      image: "img/CANAL-SOLTVTRUJILLO.png",
      title: "SOL TV",
      file:
        "https://video03.logicahost.com.br/soltv/soltv/chunklist_w149003240.m3u8"
    },
    {
      number: "133",
      image: "img/CANAL-UNIVERSAL.png",
      title: "STUDIO UNIVERSAL",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/STUDIO_UNIVERSAL/index.m3u8"
    },
    {
      number: "134",
      image: "img/canal-axn.png",
      title: "AXN",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/AXN/index.m3u8"
    },
    {
      number: "135",
      image: "img/canal-ID.png",
      title: "ID",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/DISCOVERY_ID/index.m3u8"
    },
    {
      number: "136",
      image: "img/CANAL-NAT-GEO.png",
      title: "NAT-GEO",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/NAT_GEO/index.m3u8"
    },
    {
      number: "137",
      image: "img/CANAL-FX.png",
      title: "FX",
      file:
        "https://cors-proxy.cooks.fyi/https://streamer1.nexgen.bz/FX/index.m3u8"
    }
    
  ]);
});