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
    this.keyTimeout = null;  // Para eventos de control remoto
    this.isInteracting = false;
    this.lastPlaybackTime = 0;
    this.autoHideDelay = 5000; // 5 segundos
    this.init();
  }

  init() {
    this.createPlaylistUI();
    this.addEventListeners();
    this.videoElement.autoplay = true;
    this.monitorPlayback();
  }

  createPlaylistUI() {
    // Se genera el HTML de los items
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

    // Eventos para click y touch en cada item
    const items = this.playlistElement.querySelectorAll(".playlist-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.updatePlaylistUI();
        this.playCurrent();
      });
      item.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.currentIndex = parseInt(item.getAttribute("data-index"));
        this.updatePlaylistUI();
        this.playCurrent();
      });
    });
  }

  addEventListeners() {
    const resetInactivity = () => {
      this.showPlaylist();
    };

    // Mouse
    window.addEventListener("mousemove", () => {
      resetInactivity();
      clearTimeout(this.mouseTimeout);
      this.mouseTimeout = setTimeout(() => {
        this.isInteracting = false;
      }, 300);
    });

    // Click y touchstart
    window.addEventListener("click", resetInactivity);
    window.addEventListener("touchstart", resetInactivity);

    // Teclado (control remoto)
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        this.isInteracting = true;
        resetInactivity();
        clearTimeout(this.keyTimeout);
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

    // Al pasar el mouse sobre el contenedor se detiene el auto-ocultado
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

    // Si existe un stream en HLS, por defecto usar Hls.js solo si el enlace no pertenece al dominio problemático
    if (
      currentFile.file.endsWith(".m3u8") &&
      Hls.isSupported() &&
      currentFile.file.indexOf("181.78.109.48:8000") === -1
    ) {
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
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
      // Fallback: uso del reproductor nativo HTML5
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      // También se puede considerar que el reproductor nativo sea usado para enlaces HTTP inseguros
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
        "https://fa723fc1b171.us-west-2.playback.live-video.net/api/video/v1/us-west-2.196233775518.channel.SnObcKtKq69K.m3u8?browser_family=chrome&browser_version=135.0&cdm=wv&os_name=Windows&os_version=NT%2010.0&platform=web&player_backend=mediaplayer&player_version=1.31.0&supported_codecs=av1,h264&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzM4NCJ9.eyJhd3M6Y2hhbm5lbC1hcm4iOiJhcm46YXdzOml2czp1cy13ZXN0LTI6MTk2MjMzNzc1NTE4OmNoYW5uZWwvU25PYmNLdEtxNjlLIiwiYXdzOmFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpbiI6Imh0dHBzOi8va2ljay5jb20saHR0cHM6Ly93d3cuZ3N0YXRpYy5jb20saHR0cHM6Ly8qLmtpY2subGl2ZSxodHRwczovL3BsYXllci5raWNrLmNvbSxodHRwczovL2FkbWluLmtpY2suY29tLGh0dHBzOi8vYmV0YS5raWNrLmNvbSxodHRwczovL25leHQua2ljay5jb20saHR0cHM6Ly9kYXNoYm9hcmQua2ljay5jb20saHR0cHM6Ly8qLnByZXZpZXcua2ljay5jb20iLCJhd3M6c3RyaWN0LW9yaWdpbi1lbmZvcmNlbWVudCI6ZmFsc2UsImV4cCI6MTc0NDQxMDY4N30.DSoc6N7Zb-SG2Dd-trxr2rCsWyBerXbnZrosOkC0Pj9HCZFEe5NJmHgLNNkPdYxxoJc1Sa5QkJ2JS0mlmYn51KD54t7DYniwPpFbXBu2p6apx-61hEl5BF0DNO1coyIX"
    },
    {
      number: "113",
      image: "img/canal-axn.png",
      title: "AXN",
      file: "http://181.78.109.48:8000/play/a05u/index.m3u8"
    },
    {
      number: "113",
      image: "img/CINE-TERROR.png",
      title: "CINE TERROR",
      file: "http://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/stitch/hls/channel/5d8d180092e97a5e107638d3/master.m3u8?appName=web&appVersion=unknown&clientTime=0&deviceDNT=0&deviceId=6c27e001-30d3-11ef-9cf5-e9ddff8ff496&deviceMake=Chrome&deviceModel=web&deviceType=web&deviceVersion=unknown&includeExtendedEvents=false&serverSideAds=false&sid=c0a34186-d9cb-4907-882c-bf61e4d59e0f"
    }
  ];

  player.loadPlaylist(playlist);
});