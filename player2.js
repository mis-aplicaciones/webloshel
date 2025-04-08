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
      this.isInteracting = false;
      this.lastPlaybackTime = 0;
      this.autoHideDelay = 5000; // 5 segundos de inactividad
      this.init();
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
  
      // Agrega eventos para click y eventos táctiles a cada item
      const items = this.playlistElement.querySelectorAll(".playlist-item");
      items.forEach((item) => {
        // Con click (para PC y tablets)
        item.addEventListener("click", (e) => {
          e.preventDefault();
          this.currentIndex = parseInt(item.getAttribute("data-index"));
          this.updatePlaylistUI();
          this.playCurrent();
        });
        // Con toque, se usa touchend para asegurar que finalice el gesto
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
  
      // Manejo de movimiento del mouse: se activa el contenedor y se programa un temporizador
      window.addEventListener("mousemove", () => {
        resetInactivity();
        clearTimeout(this.mouseTimeout);
        this.mouseTimeout = setTimeout(() => {
          this.isInteracting = false;
        }, 300);
      });
  
      // Otros eventos de interacción
      window.addEventListener("click", resetInactivity);
      window.addEventListener("touchstart", resetInactivity);
  
      // Eventos de teclado para navegación y activación
      window.addEventListener("keydown", (e) => {
        if (["ArrowLeft", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
          e.preventDefault();
          this.isInteracting = true;
          resetInactivity();
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
  
      // Al soltar la tecla se marca el fin de la interacción del teclado
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
  
      // Cuando el cursor o toque esté sobre el contenedor, se detiene el auto-ocultado
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
      // Actualiza la clase active y enfoca el item activo
      const items = this.playlistElement.querySelectorAll(".playlist-item");
      items.forEach((el, index) => {
        if (index === this.currentIndex) {
          el.classList.add("active");
          el.focus();
          // Centra el elemento en la vista
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          el.classList.remove("active");
        }
      });
    }
  
    playCurrent() {
      const currentFile = this.playlist[this.currentIndex];
  
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
  
      if (currentFile.file.endsWith(".m3u8") && Hls.isSupported()) {
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
        number: "111",
        image: "img/canaldw.png",
        title: "DW ESPAÑOL",
        file:
          "http://livestreamcdn.net:1935/ExtremaTV/ExtremaTV/playlist.m3u8"
      },
      {
        number: "111",
        image: "img/canal-axn.png",
        title: "AXN",
        file: "http://181.78.109.48:8000/play/a05u/index.m3u8"
      }
    ];
  
    player.loadPlaylist(playlist);
  });
  