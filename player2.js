class PlayerJS {
  constructor() {
    this.videoEl       = document.getElementById("player-video");
    this.playlistEl    = document.getElementById("carouselList");
    this.containerEl   = document.getElementById("playlist-container");
    this.spinnerEl     = document.getElementById("video-loading-spinner");
    this.clockEl       = document.getElementById("clock-container");

    // Índice de UI vs. índice de reproducción
    this.currentIndex  = 0;
    this.playbackIndex = 0;

    this.playlist      = [];
    this.hls           = null;
    this.shakaPlayer   = null;

    this.lastNavTime   = Date.now();
    this.autoHide      = 5000;

    this.visibleCount  = 7;
    this.half          = Math.floor(this.visibleCount / 2);

    // Para touch-drag
    this._touchStartY  = 0;
    this._isDragging   = false;

    this.init();
  }

  init() {
    this.initClock();
    this.addUIListeners();
    this.videoEl.autoplay = true;
    this.monitorPlayback();
    setInterval(() => {
      if (Date.now() - this.lastNavTime > this.autoHide) {
        this.hideUI();
      }
    }, 500);
    this.initTouchDrag();
  }

  initClock() {
    const upd = () => {
      const d = new Date();
      let h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
      const am = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      this.clockEl.innerText = `${h}:${m} ${am}`;
    };
    setInterval(upd, 1000);
    upd();
  }

  /**
   * Muestra el playlist.
   * @param {boolean} resetFocus  Si es true, centra en el canal en reproducción
   */
  showUI(resetFocus = false) {
    if (resetFocus) {
      this.currentIndex = this.playbackIndex;
      this.renderCarousel();
      this.updateCarousel(false);
    }
    this.containerEl.classList.add("active");
    this.clockEl.classList.remove("hidden");
    this.lastNavTime = Date.now();
  }

  hideUI() {
    this.containerEl.classList.remove("active");
    this.clockEl.classList.add("hidden");
  }

  loadPlaylist(arr) {
    this.playlist      = arr;
    this.currentIndex  = 0;
    this.playbackIndex = 0;
    this.renderCarousel();
    this.updateCarousel(false);
    this.showUI(true);
    this.playCurrent();
  }

  createItem(idx) {
    const data = this.playlist[idx];
    const item = document.createElement("div");
    item.className = "carousel-item";
    item.dataset.idx = idx;

    const lbl = document.createElement("div");
    lbl.className = "item-label";
    lbl.innerHTML = `<span>${data.number}</span>`;

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = data.title;

    const btn = document.createElement("button");
    btn.className = "carousel-button";
    btn.textContent = data.title;

    item.append(lbl, img, btn);

    // CLICK / TOUCH => play
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
    for (let offset = -this.half; offset <= this.half; offset++) {
      const idx = ((this.currentIndex + offset) % N + N) % N;
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
    const baseY = wrapH/2 - itemH/2 - this.half * itemH;

    this.playlistEl.style.transition = animate
      ? "transform .3s ease"
      : "none";
    this.playlistEl.style.transform  = `translateY(${baseY}px)`;

    Array.from(items).forEach((el,i) =>
      el.classList.toggle("focused", i === this.half)
    );

    if (!animate) {
      void this.playlistEl.offsetWidth;
      this.playlistEl.style.transition = "transform .3s ease";
    }
  }

  /**
   * Desplaza N pasos y rerenderiza
   */
  move(dir) {
    const N = this.playlist.length;
    this.currentIndex = (this.currentIndex + dir + N) % N;
    this.lastNavTime = Date.now();
    this.renderCarousel();
    this.updateCarousel(true);
  }

  playCurrent() {
    const idx = this.currentIndex;
    const f   = this.playlist[idx];
    this.playbackIndex = idx;

    if (this.hls)        { this.hls.destroy(); this.hls = null; }
    if (this.shakaPlayer){ this.shakaPlayer.destroy(); this.shakaPlayer = null; }

    if (f.file.endsWith(".m3u8") && Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength:30,
        liveSyncDurationCount:3,
        enableWorker:true
      });
      this.hls.loadSource(f.file);
      this.hls.attachMedia(this.videoEl);
      this.hls.on(Hls.Events.MANIFEST_PARSED,
        () => this.videoEl.play()
      );
    } else if (window.shaka
               && shaka.Player.isBrowserSupported()) {
      this.shakaPlayer = new shaka.Player(this.videoEl);
      this.shakaPlayer.load(f.file)
        .then(() => this.videoEl.play())
        .catch(() => {
          this.videoEl.src = f.file;
          this.videoEl.play();
        });
    } else {
      this.videoEl.src = f.file;
      this.videoEl.play();
    }
    this.videoEl.title = f.title;
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
          this.playCurrent();
        }
        last = this.videoEl.currentTime;
      }
    }, 5000);
  }

  addUIListeners() {
    // Mouse/Touch muestran UI sin reset
    ["mousemove","click","touchstart"].forEach(ev =>
      window.addEventListener(ev, () => this.showUI(false))
    );

    // Teclas
    window.addEventListener("keydown", e => {
      if (["ArrowUp","ArrowDown","Enter"].includes(e.key))
        e.preventDefault();

      // Si estaba oculto y es flecha arriba/abajo ➔ mostrar + resetFocus
      if (!this.containerEl.classList.contains("active")
          && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        return this.showUI(true);
      }

      // Si visible ➔ mover o reproducir
      if (e.key === "ArrowUp")        this.move(-1);
      else if (e.key === "ArrowDown") this.move(1);
      else if (e.key === "Enter")     this.playCurrent();
    });

    // Wheel SOLO dentro del carrusel
    this.containerEl
      .querySelector(".carousel-wrapper")
      .addEventListener("wheel", e => {
        e.preventDefault();
        this.move(e.deltaY > 0 ? 1 : -1);
      });

    // Spinner y retry on error
    this.videoEl.addEventListener("waiting",
      () => this.spinnerEl.classList.remove("hidden")
    );
    this.videoEl.addEventListener("playing",
      () => this.spinnerEl.classList.add("hidden")
    );
    this.videoEl.addEventListener("error",
      () => this.playCurrent()
    );
  }

  initTouchDrag() {
    const wrapper = this.containerEl.querySelector(".carousel-wrapper");
    const listEl  = this.playlistEl;
    let itemH, baseY;

    const recalc = () => {
      const first = listEl.children[0];
      const st    = getComputedStyle(first);
      itemH       = first.offsetHeight
                  + parseFloat(st.marginTop)
                  + parseFloat(st.marginBottom);
      const wrapH = wrapper.clientHeight;
      baseY       = wrapH/2 - itemH/2 - this.half * itemH;
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

      this.currentIndex = (this.currentIndex + steps + this.playlist.length)
                          % this.playlist.length;
      listEl.style.transition = "transform .3s ease";
      listEl.style.transform  = `translateY(${baseY}px)`;

      // Update visual focus
      Array.from(listEl.children).forEach((el,i) =>
        el.classList.toggle("focused", i === this.half)
      );
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
      image: "img/CANAL ATV.png",
      title: "ATV",
      file: "https://d19e55ehz2il4i.cloudfront.net/index.m3u8"
    },
    {
      number: "102",
      image: "img/canalnorselva.png",
      title: "NORSELVA",
      file: "https://live.obslivestream.com/norselvatv/index.m3u8"
    },
    {
      number: "103",
      image: "img/canalneotv.png",
      title: "NEO TV",
      file: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8"
    },
    {
      number: "104",
      image: "img/canalplanetatv.png",
      title: "PLANETA",
      file: "https://live.obslivestream.com/planetatv/index.m3u8"
    },
    {
      number: "105",
      image: "img/CANAL-AMC.png",
      title: "AMC",
      file:
        "http://vegafibratv.com:8085/AMC/index.m3u8"
    },
    {
      number: "106",
      image: "img/canalwowtv.png",
      title: "WOW TV",
      file:
        "https://cdn.elsalvadordigital.com:1936/wowtv/smil:wowtv.smil/playlist.m3u8"
    },
    {
      number: "107",
      image: "img/canalcocotv.png",
      title: "COCO TV",
      file:
        "https://cloudflare.streamgato.us:3253/live/canalcocotvlive.m3u8"
    },
    {
      number: "108",
      image: "img/canalsoltv.png",
      title: "SOL TV",
      file:
        "https://cdn.streamhispanatv.net:3409/live/soltvlive.m3u8"
    },
    {
      number: "109",
      image: "img/canalorbittv.png",
      title: "ORBIT TV",
      file:
        "https://ss3.domint.net:3134/otv_str/orbittv/playlist.m3u8"
    },
    {
      number: "110",
      image: "img/canalsonynovelas.png",
      title: "SONY NOVELAS",
      file:
        "https://a89829b8dca2471ab52ea9a57bc28a35.mediatailor.us-east-1.amazonaws.com/v1/master/0fb304b2320b25f067414d481a779b77db81760d/CanelaTV_SonyCanalNovelas/playlist.m3u8"
    },
    {
      number: "111",
      image: "img/canaldw.png",
      title: "DW ESPAÑOL",
      file:
        "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8"
    },
    {
      number: "112",
      image: "img/CANAL-PANAMERICANA.png",
      title: "PANAMERICANA TV",
      file:
        "https://sae12.playlist.live-video.net/v1/playlist/CsEFxVRK_puBYGmeHU892DSzPw_0F7k2LcmjK5v6nOtlbp7If0bppqXSBjLQ8OkLekBQp0X9h7hineXw8N-HPbjeiXY-OumZnlNteUxp4KeYuY90gE-oyL5IviBybDaQBoKxfcLq0PVIIUN2vT4QPSBw-PJPVRXXYaYVnD7mLvgRGUUiwTUgMIyfau_3cs2X5o-r-QieHdlOUoYFE6Fq_s9y7ZB_sc9IzqxXhNx2v5FN_cJ82b0l1ut3ibcBfejXOcMz1Ruo6zy-GObNAzmTdrG4c-YtE9TOQhsd4Nk0yxn8Nj_8mrcZrtTOFQT6Mf0Xpf3gADtOYnVhv98ZPOI8tC7p60wd6l78PmY9eUoZHaOxWeG1mewNWUvgtLa736byVXK9aCn2M9YJVyD8Bbqh_bgc7vjg-6frisDan84X62qTEHhW2i6K0_vQbKAM-ZKp3GVie_UUfKJhzhNYixck3NnKKdgdwVlZV2uRDsfUhxjSFyb_1-qU8Oif8xAA1wTfsrzEvt3KUCaJRaStJy916sqOVK2DMRF94p9JO03W3JdnKuv-F5TNe08xUSx7RP5rFEUymMWqKfrS1g4wPhKJ5fyXbMGpIRW-JXiKnAiu8tBjWv-9KMndZRTxXifASBPLWTh21OB4Dw9_PFHM9yJtr1d-7K5We69IH3MdLZeW7Q3IvIw6AoEPDrNiSqiiesRris2SZbwDZ9VZ33lDU7Dy76vZavvf-j0KV9A7ZtN_CbSRRYsOJisW23pFaFMMBrS4zEATYXmiQA2AhL5DSzdv1z8zoc_x8_b1SUS6bAg0DGVlH5ziY6YPkpxxF5A6Ip0HoDHAT4aoXiLMlw7Lp_OZcgAsHU2AUpwLZFzn4UlhFZdxpFJqIqqQDhLZWqWs3u6Gjcl09zWDWIWpOxpZ2FT8MtWf-0VwwTAv5HosPzuzbAQapd_hGgw-XHWq5hxqoE1mhbAgASoJdXMtZWFzdC0yMIIM.m3u8"
    },
    {
      number: "113",
      image: "img/CANAL57.png",
      title: "CANAL 57",
      file: "https://167790.global.ssl.fastly.net/6189746bccf0424c112f5476/live_50bbca50292011ed8d265962bedee5f9/tracks-v2a1/mono.m3u8"
    },
    {
      number: "114",
      image: "img/CANAL-ESTRELLAS.png",
      title: "LAS ESTRELLAS",
      file:
        "https://channel01-onlymex.akamaized.net/hls/live/2022749/event01/index.m3u8"
    },
    {
      number: "115",
      image: "img/CANAL-RETROPLUS.png",
      title: "RETRO",
      file:
        "https://ssh101stream.ssh101.com/akamaissh101/ssh101/retroplustv03/playlist.m3u8"
    },
    {
      number: "116",
      image: "img/CANAL-TELEMUNDO.png",
      title: "TELEMUNDO",
      file:
        "https://nbculocallive.akamaized.net/hls/live/2037499/puertorico/stream1/master.m3u8"
    },
    {
      number: "117",
      image: "img/CANAL-CTV.png",
      title: "CTV INTERNCIONAL",
      file:
        "https://mediacp.us:8081/ctvhn/index.m3u8"
    },
    {
      number: "118",
      image: "img/CANAL-BAYRES.png",
      title: "BAYRES TV",
      file:
        "https://streaming02.gbasat.com.ar:19360/bayrestv/bayrestv.m3u8"
    }
    ,
    {
      number: "119",
      image: "img/CANAL-FMCOSMOS.png",
      title: "COSMOS TV",
      file:
        "https://tv.mediacp.eu:19360/cosmos/cosmos.m3u8"
    },
    {
      number: "120",
      image: "img/CANAL-SONY.png",
      title: "SONY CINE",
      file:
        "https://a-cdn.klowdtv.com/live1/cine_720p/playlist.m3u8"
    }
    ,
    {
      number: "121",
      image: "img/CANAL-TELEMUNDOACCION.png",
      title: "ACCIÓN",
      file:
        "https://xumo-drct-ch835-ekq0p.fast.nbcuni.com/live/master.m3u8"
    }
  ]);
});
