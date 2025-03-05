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
      this.isInteracting = false; // Variable para detectar interacción
      this.lastPlaybackTime = 0; // Para detectar congelación
      this.init();
  }

  init() {
      this.createPlaylistUI();
      this.addEventListeners();
      this.videoElement.autoplay = true;
      this.monitorPlayback(); // Inicia la detección de problemas en la reproducción
  }

  createPlaylistUI() {
      this.playlistElement.innerHTML = this.playlist
          .map((item, index) => `
              <div class="playlist-item ${index === this.currentIndex ? "active" : ""}" data-index="${index}">
                  <span>${item.number}</span>
                  <img src="${item.image}" alt="Imagen del canal">
                  ${item.title}
              </div>
          `)
          .join("");
  }

  addEventListeners() {
      window.addEventListener("mousemove", () => this.showPlaylist());
      window.addEventListener("keydown", (e) => {
          if (e.key === "ArrowLeft") {
              this.showPlaylist();
          } else if (e.key === "ArrowUp") {
              this.isInteracting = true;
              this.scrollPlaylist(-1);
          } else if (e.key === "ArrowDown") {
              this.isInteracting = true;
              this.scrollPlaylist(1);
          } else if (e.key === "Enter") {
              this.isInteracting = true;
              this.playCurrent();
          }
      });

      this.scrollUpButton.addEventListener("click", () => {
          this.isInteracting = true;
          this.scrollPlaylist(-1);
      });

      this.scrollDownButton.addEventListener("click", () => {
          this.isInteracting = true;
          this.scrollPlaylist(1);
      });

      this.playlistContainer.addEventListener("mouseenter", () => this.stopAutoHide());
      this.playlistContainer.addEventListener("mouseleave", () => this.startAutoHide());
      this.playlistElement.addEventListener("mouseenter", () => this.stopAutoHide());
      this.playlistElement.addEventListener("mouseleave", () => this.startAutoHide());
      this.scrollUpButton.addEventListener("mouseenter", () => this.stopAutoHide());
      this.scrollDownButton.addEventListener("mouseenter", () => this.stopAutoHide());

      window.addEventListener("keyup", () => {
          this.isInteracting = false;
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
      }, 5000);
  }

  stopAutoHide() {
      clearTimeout(this.hideTimeout);
  }

  scrollPlaylist(direction) {
      this.currentIndex = (this.currentIndex + direction + this.playlist.length) % this.playlist.length;
      this.updatePlaylistUI();
  }

  updatePlaylistUI() {
      const items = this.playlistElement.querySelectorAll(".playlist-item");
      items.forEach((el, index) => el.classList.toggle("active", index === this.currentIndex));

      this.playlistElement.scrollTo({ top: this.currentIndex * 60, behavior: "smooth" });
  }

  playCurrent() {
      const currentFile = this.playlist[this.currentIndex];
      if (this.hls) {
          this.hls.destroy();
          this.hls = null;
      }
      if (currentFile.file.endsWith(".m3u8") && Hls.isSupported()) {
          this.hls = new Hls();
          this.hls.loadSource(currentFile.file);
          this.hls.attachMedia(this.videoElement);
      } else {
          this.videoElement.src = currentFile.file;
      }
      this.videoElement.title = currentFile.title;
      this.videoElement.play();
  }

  // Sistema de detección de problemas en la reproducción
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
      { number: "100", image: "https://upload.wikimedia.org/wikipedia/commons/6/6d/Latina_Television_-_Logotipo.png", title: "LATINA TV", file: "https://jireh-3-hls-video-pe-isp.dps.live/hls-video/567ffde3fa319fadf3419efda25619456231dfea/latina/latina.smil/latina/livestream2/chunks.m3u8" },
      { number: "101", image: "https://images.seeklogo.com/logo-png/33/1/atv-peru-logo-png_seeklogo-331331.png", title: "ATV", file: "https://d19e55ehz2il4i.cloudfront.net/index.m3u8" },
      { number: "102", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxdpWfUnVl5ascyAFwZhc834smz4hHOZmYgA&s", title: "NORSELVA", file: "https://live.obslivestream.com/norselvatv/index.m3u8" },
      { number: "103", image: "https://neotvdigital.com.ar/imagenes/logo1.png", title: "NEO TV", file: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8" },
      { number: "104", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://live.obslivestream.com/planetatv/index.m3u8" },
      { number: "105", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://solo.disfrutaenlared.com:1936/tvcbba/tvcbba/playlist.m3u8" },
      { number: "106", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://cdn.elsalvadordigital.com:1936/wowtv/smil:wowtv.smil/playlist.m3u8" },
      { number: "107", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcShG9_L1ZgsZFk58rdfDbHZTO_NtuNDz9AJ8g&s", title: "COCO TV", file: "https://cloudflare.streamgato.us:3253/live/canalcocotvlive.m3u8" },
      { number: "108", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://cdn.streamhispanatv.net:3409/live/soltvlive.m3u8" },
      { number: "109", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://ss3.domint.net:3134/otv_str/orbittv/playlist.m3u8" },
      { number: "110", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://a89829b8dca2471ab52ea9a57bc28a35.mediatailor.us-east-1.amazonaws.com/v1/master/0fb304b2320b25f067414d481a779b77db81760d/CanelaTV_SonyCanalNovelas/playlist.m3u8" },
      { number: "111", image: "https://via.placeholder.com/50", title: "Canal 1", file: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8" }
  ];

  player.loadPlaylist(playlist);
});
