
class PlayerJS {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.playlist = [];
    this.currentIndex = 0;
    this.videoElement = document.getElementById("player-video");
    this.hls = null;
    this.playlistContainer = document.getElementById("playlist-container");
    this.playlistElement = document.getElementById("playlist");
    this.scrollUpButton = document.getElementById("scroll-up");
    this.scrollDownButton = document.getElementById("scroll-down");
    this.hideTimeout = null;
    this.mouseTimeout = null;
    this.keyTimeout = null;  // Temporizador para eventos de control remoto
    this.isInteracting = false;
    this.lastPlaybackTime = 0;
    this.autoHideDelay = 5000; // 5 segundos de inactividad
    this.init();
  }

  // Detecta si el usuario está en un dispositivo Android (incluyendo Android TV)
  isAndroidDevice() {
    return /Android/.test(navigator.userAgent);
  }

  init() {
    this.createPlaylistUI();
    this.addEventListeners();
    this.videoElement.autoplay = true;
    this.monitorPlayback();
  }

  createPlaylistUI() {
    // Genera el HTML de los items
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

    // Agrega eventos para click y touch a cada item
    const items = this.playlistElement.querySelectorAll(".playlist-item");
    items.forEach((item) => {
      // Para click (PC, tablets)
      item.addEventListener("click", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.updatePlaylistUI();
        this.playCurrent();
      });
      // Para touch (smartphones, tablets)
      item.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.updatePlaylistUI();
        this.playCurrent();
      });
    });
  }

  addEventListeners() {
    // Función para reiniciar la inactividad
    const resetInactivity = () => {
      this.showPlaylist();
    };

    // Manejo de movimiento del mouse
    window.addEventListener("mousemove", () => {
      resetInactivity();
      clearTimeout(this.mouseTimeout);
      this.mouseTimeout = setTimeout(() => {
        this.isInteracting = false;
      }, 300);
    });

    // Otros eventos de interacción (click y touchstart)
    window.addEventListener("click", resetInactivity);
    window.addEventListener("touchstart", resetInactivity);

    // Eventos de teclado para navegación y activación
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        this.isInteracting = true;
        resetInactivity();
        clearTimeout(this.keyTimeout);
        // Timeout para "liberar" la interacción en caso de que keyup no se dispare (caso típico en Android TV)
        this.keyTimeout = setTimeout(() => {
          this.isInteracting = false;
          this.startAutoHide();
        }, 500);
      }
      if (e.key === "ArrowLeft") {
        this.showPlaylist();
      } else if (e.key === "ArrowUp") {
        this.scrollPlaylist(-1);
      } else if (e.key === "ArrowDown") {
        this.scrollPlaylist(1);
      } else if (e.key === "Enter") {
        this.playCurrent();
      }
    });

    // Para casos en que se detecte keyup (si ocurre)
    window.addEventListener("keyup", () => {
      this.isInteracting = false;
      this.startAutoHide();
    });
    window.addEventListener("touchend", () => {
      this.isInteracting = false;
      this.startAutoHide();
    });

    this.scrollUpButton.addEventListener("click", () => this.scrollPlaylist(-1));
    this.scrollDownButton.addEventListener("click", () => this.scrollPlaylist(1));

    // Cuando el cursor o el enfoque táctil esté sobre el contenedor se detiene el auto-ocultado
    this.playlistContainer.addEventListener("mouseenter", () => {
      this.stopAutoHide();
    });
    this.playlistContainer.addEventListener("mouseleave", () => {
      this.startAutoHide();
    });

    this.videoElement.addEventListener("error", () => this.handlePlaybackError());
  }

  showPlaylist() {
    this.playlistContainer.classList.add("active");
    this.startAutoHide();
  }

  startAutoHide() {
    this.stopAutoHide();
    this.hideTimeout = setTimeout(() => {
      // Si ya no se detecta interacción y el contenedor no está siendo apuntado, se oculta
      if (!this.isInteracting && !this.playlistContainer.matches(":hover")) {
        this.playlistContainer.classList.remove("active");
      }
    }, this.autoHideDelay);
  }

  stopAutoHide() {
    clearTimeout(this.hideTimeout);
  }

  scrollPlaylist(direction) {
    this.currentIndex =
      (this.currentIndex + direction + this.playlist.length) % this.playlist.length;
    this.updatePlaylistUI();
  }

  updatePlaylistUI() {
    // Actualiza la clase active, enfoca el item activo y lo centra en la vista
    const items = this.playlistElement.querySelectorAll(".playlist-item");
    items.forEach((el, index) => {
      if (index === this.currentIndex) {
        el.classList.add("active");
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        el.classList.remove("active");
      }
    });
  }

  playCurrent() {
    const currentFile = this.playlist[this.currentIndex];

    // Si hay una instancia de Hls ya creada, se destruye
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    /* 
      Si el archivo es un .m3u8 y Hls.js es compatible, se usa Hls
      excepto si se detecta que estamos en un dispositivo Android (incluido Android TV)
      y el enlace contiene "181.78.109.48:8000", caso en el cual se usará la reproducción nativa.
    */
    if (
      currentFile.file.endsWith(".m3u8") &&
      Hls.isSupported() &&
      !(this.isAndroidDevice() && currentFile.file.indexOf("181.78.109.48:8000") > -1)
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
      // Para el enlace problemático en Android/Android TV o en cualquier otro caso, se usa el reproductor nativo
      this.videoElement.src = currentFile.file;
      this.videoElement.play();
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
      console.warn("🔄 Reloading HLS stream...");
      this.hls.detachMedia();
      this.hls.loadSource(currentFile.file);
      this.hls.attachMedia(this.videoElement);
    } else {
      console.warn("🔄 Restarting MP4 playback...");
      this.videoElement.src = currentFile.file;
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
      image: "img/CANAL ATV.JPG",
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
        "https://sae11.playlist.live-video.net/v1/playlist/CtoFHywC-LRWHpQnPACaFVordtZ32QwHdYImrkZdlSKQ0R5rxqwHFM4mqe4uVgE5lns_uzoOLDl9jxDcxSv3HTphJhlXj6IY9FGugzAg660ni5vbqA-jGs2J5qM6dKxvz-477pXTqfjYnrmLlCOMbzh6GD6P52HVHnMONIJFN-9X8_0hqKVf-_PaiuzUcZY5PQEfrUy97Z7se89FM2u2DNAxrHHrylmKkdyXB4m33EFVtPxbm7Ml5Iei7Mpx-XlZRrwpLKDfTssZKYtAn5wG08R7h0DeTQjHP_xzFBHhyRLBTP-jHfIqkApj4C28ZsMc5THKTN9vRlgbpleWrnESxKchrTTPLDQwhyc7ZblwoixsU-0_OY1udbFn28NNqR0xDaLpNcOJTPsCLIuYB1yIA63KDbLEjUlMmfnL7F1_VbHZtuC1ZdipyTX6NL9f5Z2nmeICf7ozpcB7ex_nAUNw2E1Hmxna--kb2Onn6vPrnfRhxih3k2O-ztpRDmawfu161IYgWzHcyoKnbkRjQ2viKmKG2lBMVrJsHM0vvun9nl1Ylp3r7E0DoIBUyr3n6M4Idjo12nje6iYuabcxLxWYuYb2ZHzuszF8SmAkpQq5sUO9xk3uip6908SSydbJVcgPDwkJyMVope0NErqPlIMRor10BXku5vzzyiMfrMT3dp4mXEIXsVQbtthI3J1UYH7kTCdy90Pfbtyx9yt9cmyOxm_Azkp3cF2_EJF5Hh49ql4ffN7HrXaj-4tqQ61oyrNb4mVUDWqvmEDoF1QkuUszgjBAwm9r6XXLOxMHikuA-tO9ngVCrbUGMsYYaZjkwHsfyispafAzZJPcmfvAHGiAXUPsWWMc3v4gmWe9wVf_zF6akmzuNcWrwmsKg2Yml1nA_PaoWadVwD89b1XpLzW_EQlfJvs7Fh2STWTQhfD3VYPB3cDLq-Hm8UZs5U85VQAzVULCExK_F3dHbzqOLxoMdZLVyE7utokxdQq3IAEqCXVzLWVhc3QtMjCBDA.m3u8"
    },
    {
      number: "113",
      image: "img/canal-axn.png",
      title: "AXN",
      file: "http://181.78.109.48:8000/play/a05u/index.m3u8"
    },
    {
      number: "114",
      image: "img/CINE-TERROR.png",
      title: "CINE TERROR",
      file: "http://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/stitch/hls/channel/5d8d180092e97a5e107638d3/master.m3u8?appName=web&appVersion=unknown&clientTime=0&deviceDNT=0&deviceId=6c27e001-30d3-11ef-9cf5-e9ddff8ff496&deviceMake=Chrome&deviceModel=web&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=c0a34186-d9cb-4907-882c-bf61e4d59e0f"
    }
  ];

  player.loadPlaylist(playlist);
});
