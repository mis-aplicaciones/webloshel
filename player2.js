
class PlayerJS {
  constructor() {
    // DOM elements
    this.videoEl      = document.getElementById("player-video");
    this.playlistEl   = document.getElementById("carouselList");
    this.containerEl  = document.getElementById("playlist-container");
    this.spinnerEl    = document.getElementById("video-loading-spinner");
    this.clockEl      = document.getElementById("clock-container");

    // Playback & playlist
    this.playlist     = [];
    this.currentIndex = 0;
    this.hls          = null;
    this.shakaPlayer  = null;

    // Auto-hide UI
    this.lastNavTime  = Date.now();
    this.autoHide     = 5000;

    // Carousel config
    this.visibleCount = 5;
    this.half         = Math.floor(this.visibleCount / 2);

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
  }

  initClock() {
    const upd = () => {
      const d   = new Date();
      let h    = d.getHours(),
          m    = String(d.getMinutes()).padStart(2, "0"),
          ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      this.clockEl.innerText = `${h}:${m} ${ampm}`;
    };
    setInterval(upd, 1000);
    upd();
  }

  showUI() {
    this.containerEl.classList.add("active");
    this.clockEl.classList.remove("hidden");
    // No recreamos el DOM para no reiniciar la animación de zoom
    this.updateCarousel(false);
    this.lastNavTime = Date.now();
  }

  hideUI() {
    this.containerEl.classList.remove("active");
    this.clockEl.classList.add("hidden");
  }

  loadPlaylist(arr) {
    this.playlist     = arr;
    this.currentIndex = 0;
    this.renderCarousel();
    this.showUI();
    this.playCurrent();
  }

  createItem(idx, isFocused) {
    const data = this.playlist[idx];
    const item = document.createElement("div");
    item.className = "carousel-item" + (isFocused ? " focused" : "");

    const lbl = document.createElement("div");
    lbl.className = "item-label";
    const num = document.createElement("span");
    num.textContent = data.number;
    lbl.appendChild(num);

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = data.title;

    const btn = document.createElement("button");
    btn.className = "carousel-button";
    btn.textContent = data.title;

    item.append(lbl, img, btn);
    return item;
  }

  renderCarousel() {
    const mod = (n,m) => ((n % m) + m) % m;
    const N   = this.playlist.length;
    this.playlistEl.innerHTML = "";
    for (let i = -this.half; i <= this.half; i++) {
      const idx     = mod(this.currentIndex + i, N);
      const focused = i === 0;
      this.playlistEl.appendChild(this.createItem(idx, focused));
    }
  }

  updateCarousel(animate = true) {
    const els    = this.playlistEl.children;
    const itemH  = els[0].offsetHeight + 16;
    // mantenemos el centrado estático: siempre translateY de -half*itemH
    const offset = -(this.half * itemH);

    this.playlistEl.style.transition = animate ? "transform .3s ease" : "none";
    this.playlistEl.style.transform  = `translateY(${offset}px)`;

    Array.from(els).forEach((el, i) => {
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
    this.lastNavTime  = Date.now();
    this.renderCarousel();
    this.updateCarousel(true);
  }

  playCurrent() {
    const fileObj = this.playlist[this.currentIndex];
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.shakaPlayer) { this.shakaPlayer.destroy(); this.shakaPlayer = null; }

    if (
      fileObj.file.endsWith(".m3u8") &&
      Hls.isSupported() &&
      !(
        /Android/.test(navigator.userAgent) &&
        ( fileObj.file.startsWith("http://") ||
          fileObj.file.includes("181.78.109.48:8000") ||
          fileObj.file.includes("cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv") )
      )
    ) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxBufferSize: 60e6,
        liveSyncDurationCount: 3,
        enableWorker: true
      });
      this.hls.loadSource(fileObj.file);
      this.hls.attachMedia(this.videoEl);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => this.videoEl.play());
    } else if (window.shaka && shaka.Player.isBrowserSupported()) {
      this.shakaPlayer = new shaka.Player(this.videoEl);
      this.shakaPlayer.load(fileObj.file)
        .then(() => this.videoEl.play())
        .catch(() => {
          this.videoEl.src = fileObj.file;
          this.videoEl.play();
        });
    } else {
      this.videoEl.src = fileObj.file;
      this.videoEl.play();
    }
    this.videoEl.title = fileObj.title;
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
    ["mousemove","click","touchstart"].forEach(ev =>
      window.addEventListener(ev, () => this.showUI())
    );
    window.addEventListener("keydown", e => {
      if (["ArrowUp","ArrowDown","Enter","ArrowLeft"].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowUp")    this.move(-1);
      else if (e.key === "ArrowDown") this.move(1);
      else if (e.key === "Enter")     this.playCurrent();
      else if (e.key === "ArrowLeft") this.showUI();
    });
    document.querySelector(".carousel-wrapper")
      .addEventListener("wheel", e => {
        e.preventDefault();
        this.move(e.deltaY > 0 ? 1 : -1);
      });
    this.videoEl.addEventListener("waiting", () => this.spinnerEl.classList.remove("hidden"));
    this.videoEl.addEventListener("playing", () => this.spinnerEl.classList.add("hidden"));
    this.videoEl.addEventListener("error",   () => this.playCurrent());
  }
}

// Arranque
document.addEventListener("DOMContentLoaded", () => {
  const player = new PlayerJS();
  player.loadPlaylist([
    {
      number: "100",
      image: "img/canallatina.png",
      title: "LATINA TV",
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
      image: "img/canalmegatv.png",
      title: "MEGATV",
      file:
        "https://solo.disfrutaenlared.com:1936/tvcbba/tvcbba/playlist.m3u8"
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
      number: "116",
      image: "img/CANAL-CTV.png",
      title: "CTV INTERNCIONAL",
      file:
        "https://mediacp.us:8081/ctvhn/index.m3u8"
    },
    {
      number: "116",
      image: "img/CINE-TERROR.png",
      title: "FOX DEPORTE",
      file:
        "https://live-news-manifest.tubi.video/live-news-manifest/csm/extlive/tubiprd01,Fox-Sports-Espanol2.m3u8"
    }
    ,
    {
      number: "116",
      image: "img/CINE-TERROR.png",
      title: "ESPN DEPORTES",
      file:
        "http://190.92.10.66:4000/play/a003/index.m3u8"
    },
    {
      number: "116",
      image: "img/CINE-TERROR.png",
      title: "ESPN PREMIUM",
      file:
        "http://190.102.246.93:9005/play/a00x"
    }
  ]);
});
