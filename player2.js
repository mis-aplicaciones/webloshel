

class PlayerJS {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.playlist = [];
    this.currentIndex = 0;
    this.videoElement = document.getElementById("player-video");
    this.hls = null;
    // Nueva propiedad para Shaka Player
    this.shakaPlayer = null;
    
    this.playlistContainer = document.getElementById("playlist-container");
    this.playlistElement = document.getElementById("playlist");
    this.scrollUpButton = document.getElementById("scroll-up");
    this.scrollDownButton = document.getElementById("scroll-down");
    this.spinner = document.getElementById("video-loading-spinner");
    this.clockContainer = document.getElementById("clock-container");
    
    this.hideTimeout = null;
    this.mouseTimeout = null;
    this.keyTimeout = null;
    this.lastNavTime = Date.now();
    this.autoHideDelay = 5000; // 5 segundos de inactividad
    this.init();
  }

  // Detecta si se está en Android (incluyendo Android TV)
  isAndroidDevice() {
    return /Android/.test(navigator.userAgent);
  }

  init() {
    this.createPlaylistUI();
    this.addEventListeners();
    this.videoElement.autoplay = true;
    this.monitorPlayback();
    this.initClock();
    // Timer que oculta la UI si han pasado autoHideDelay sin navegación real
    setInterval(() => {
      if (Date.now() - this.lastNavTime > this.autoHideDelay) {
        this.hideUI();
      }
    }, 500);
  }

  initClock() {
    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      this.clockContainer.innerText = `${hours}:${minutes} ${ampm}`;
    };
    setInterval(updateClock, 1000);
    updateClock();
  }

  createPlaylistUI() {
    this.playlistElement.innerHTML = this.playlist
      .map(
        (item, index) => `
        <div class="playlist-item ${index === this.currentIndex ? "active" : ""}" data-index="${index}" tabindex="0">
          <span>${item.number}</span>
          <img src="${item.image}" alt="Imagen del canal">
          ${item.title}
        </div>
      `
      )
      .join("");
    const items = this.playlistElement.querySelectorAll(".playlist-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.lastNavTime = Date.now();
        this.updatePlaylistUI();
        this.playCurrent();
      });
      item.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.lastNavTime = Date.now();
        this.updatePlaylistUI();
        this.playCurrent();
      });
    });
  }

  addEventListeners() {
    const resetInactivity = () => {
      this.showUI();
    };

    window.addEventListener("mousemove", () => {
      resetInactivity();
      clearTimeout(this.mouseTimeout);
      this.mouseTimeout = setTimeout(() => {}, 300);
    });
    window.addEventListener("click", resetInactivity);
    window.addEventListener("touchstart", resetInactivity);

    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === "ArrowLeft") {
        this.showUI();
      } else if (e.key === "ArrowUp") {
        this.scrollPlaylist(-1);
      } else if (e.key === "ArrowDown") {
        this.scrollPlaylist(1);
      } else if (e.key === "Enter") {
        this.playCurrent();
      }
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        this.lastNavTime = Date.now();
      }
    });
    window.addEventListener("touchend", () => {
      this.lastNavTime = Date.now();
    });

    this.scrollUpButton.addEventListener("click", () => this.scrollPlaylist(-1));
    this.scrollDownButton.addEventListener("click", () => this.scrollPlaylist(1));

    this.playlistContainer.addEventListener("mouseenter", () => {
      this.stopAutoHide();
    });
    this.playlistContainer.addEventListener("mouseleave", () => {
      this.lastNavTime = Date.now();
      this.startAutoHide();
    });

    // Eventos del video para el spinner de carga
    this.videoElement.addEventListener("waiting", () => {
      this.spinner.classList.remove("hidden");
    });
    this.videoElement.addEventListener("playing", () => {
      this.spinner.classList.add("hidden");
    });
    this.videoElement.controls = false;
    this.videoElement.addEventListener("error", () => this.handlePlaybackError());
  }

  showUI() {
    this.playlistContainer.classList.add("active");
    this.clockContainer.classList.remove("hidden");
    this.updatePlaylistUI();
    this.lastNavTime = Date.now();
    this.startAutoHide();
  }

  hideUI() {
    this.playlistContainer.classList.remove("active");
    this.clockContainer.classList.add("hidden");
    this.blurActiveItem();
  }

  startAutoHide() {
    this.stopAutoHide();
    this.hideTimeout = setTimeout(() => {
      if (Date.now() - this.lastNavTime > this.autoHideDelay) {
        this.hideUI();
      }
    }, this.autoHideDelay);
  }

  stopAutoHide() {
    clearTimeout(this.hideTimeout);
  }

  blurActiveItem() {
    const activeItem = this.playlistElement.querySelector(".playlist-item.active");
    if (activeItem) {
      activeItem.blur();
    }
  }

  scrollPlaylist(direction) {
    this.currentIndex =
      (this.currentIndex + direction + this.playlist.length) % this.playlist.length;
    this.lastNavTime = Date.now();
    this.updatePlaylistUI();
  }

  updatePlaylistUI() {
    const items = this.playlistElement.querySelectorAll(".playlist-item");
    items.forEach((el, index) => {
      if (index === this.currentIndex) {
        el.classList.add("active");
        if (this.playlistContainer.classList.contains("active")) {
          el.focus();
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        el.classList.remove("active");
      }
    });
  }

  playCurrent() {
    const currentFile = this.playlist[this.currentIndex];
    // Destruir instancias previas
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.shakaPlayer) {
      this.shakaPlayer.destroy();
      this.shakaPlayer = null;
    }

    /*  
      Si el archivo es .m3u8 y Hls.js es soportado se usará Hls.js, excepto cuando:
      - Estamos en Android/Android TV y el enlace comienza con "http://", contiene "181.78.109.48:8000"
        o contiene "cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv".
      En ese caso se intentará usar Shaka Player, y si no es compatible se recurre al reproductor nativo.
    */
    if (
      currentFile.file.endsWith(".m3u8") &&
      Hls.isSupported() &&
      !(
        this.isAndroidDevice() &&
        ( currentFile.file.startsWith("http://") ||
          currentFile.file.indexOf("181.78.109.48:8000") > -1 ||
          currentFile.file.indexOf("cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv") > -1 )
      )
    ) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxBufferSize: 60 * 1000 * 1000,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 3,
        enableWorker: true
      });
      this.hls.loadSource(currentFile.file);
      this.hls.attachMedia(this.videoElement);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.videoElement.play();
      });
    } else {
      // Intentar usar Shaka Player (si el navegador lo soporta)
      if (window.shaka && shaka.Player.isBrowserSupported()) {
        this.shakaPlayer = new shaka.Player(this.videoElement);
        this.shakaPlayer.load(currentFile.file).then(() => {
          this.videoElement.play();
        }).catch((error) => {
          console.error("Shaka Player error: ", error);
          // Si falla Shaka, fallback a reproductor nativo:
          this.videoElement.src = currentFile.file;
          this.videoElement.load();
          this.videoElement.play();
        });
      } else {
        // Fallback directo a reproductor nativo
        this.videoElement.src = currentFile.file;
        this.videoElement.load();
        this.videoElement.play();
      }
    }
    this.videoElement.title = currentFile.title;
  }

  monitorPlayback() {
    setInterval(() => {
      if (!this.videoElement.paused && !this.videoElement.ended) {
        if (this.lastPlaybackTime === this.videoElement.currentTime) {
          console.warn("⚠️ Detected frozen playback. Attempting to restart stream...");
          this.recoverPlayback();
        }
        this.lastPlaybackTime = this.videoElement.currentTime;
      }
    }, 5000);
  }

  recoverPlayback() {
    const currentFile = this.playlist[this.currentIndex];
    if (this.hls) {
      console.warn("🔄 Reloading Hls stream...");
      this.hls.detachMedia();
      this.hls.loadSource(currentFile.file);
      this.hls.attachMedia(this.videoElement);
    } else if (this.shakaPlayer) {
      console.warn("🔄 Reloading Shaka Player stream...");
      this.shakaPlayer.load(currentFile.file).then(() => {
        this.videoElement.play();
      });
    } else {
      console.warn("🔄 Restarting native playback...");
      this.videoElement.src = currentFile.file;
      this.videoElement.load();
      this.videoElement.play();
    }
  }

  handlePlaybackError() {
    console.error("❌ Error in playback. Restarting stream...");
    this.recoverPlayback();
  }

  loadPlaylist(playlist) {
    this.playlist = playlist;
    this.currentIndex = 0;
    this.createPlaylistUI();
    this.playCurrent();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const player = new PlayerJS("player-container");

  const playlist = [
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
      image: "img/canal-axn.png",
      title: "CANAL 57",
      file: "https://167790.global.ssl.fastly.net/6189746bccf0424c112f5476/live_50bbca50292011ed8d265962bedee5f9/tracks-v2a1/mono.m3u8"
    },
    {
      number: "114",
      image: "img/CINE-TERROR.png",
      title: "LAS ESTRELLAS",
      file:
        "https://channel01-onlymex.akamaized.net/hls/live/2022749/event01/index.m3u8"
    },
    {
      number: "115",
      image: "img/CINE-TERROR.png",
      title: "TELEMUNDO",
      file:
        "https://nbculocallive.akamaized.net/hls/live/2037499/puertorico/stream1/master.m3u8"
    },
    {
      number: "116",
      image: "img/CINE-TERROR.png",
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
    },
    {
      number: "116",
      image: "img/CINE-TERROR.png",
      title: "RETRO",
      file:
        "https://ssh101stream.ssh101.com/akamaissh101/ssh101/retroplustv03/playlist.m3u8"
    }
  ];
  
  player.loadPlaylist(playlist);
});
