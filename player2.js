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
        this.isInteracting = false;
        this.lastPlaybackTime = 0;
        this.init();
    }
  
    init() {
        this.createPlaylistUI();
        this.addEventListeners();
        this.videoElement.autoplay = true;
        this.monitorPlayback();
    }
  
    createPlaylistUI() {
        this.playlistElement.innerHTML = this.playlist
            .map((item, index) => `
                <div class="playlist-item ${index === this.currentIndex ? "active" : ""}" data-index="${index}" tabindex="0">
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
            this.hls = new Hls({
                maxBufferLength: 30, // Mantiene un buffer de 30 segundos
                maxBufferSize: 60 * 1000 * 1000, // Hasta 60MB de buffer
                maxMaxBufferLength: 60, // Hasta 60 segundos en condiciones óptimas
                liveSyncDurationCount: 3, // Baja latencia en streams en vivo
                enableWorker: true // Mejora rendimiento en segundo plano
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
      { number: "100", image: "img/canallatina.png", title: "LATINA TV", file: "https://jireh-3-hls-video-pe-isp.dps.live/hls-video/567ffde3fa319fadf3419efda25619456231dfea/latina/latina.smil/latina/livestream2/chunks.m3u8" },
      { number: "101", image: "img/CANAL ATV.JPG", title: "ATV", file: "https://d19e55ehz2il4i.cloudfront.net/index.m3u8" },
      { number: "102", image: "img/canalnorselva.png", title: "NORSELVA", file: "https://live.obslivestream.com/norselvatv/index.m3u8" },
      { number: "103", image: "img/canalneotv.png", title: "NEO TV", file: "https://videostream.shockmedia.com.ar:19360/neotvdigital/neotvdigital.m3u8" },
      { number: "104", image: "img/canalplanetatv.png", title: "PLANETA", file: "https://live.obslivestream.com/planetatv/index.m3u8" },
      { number: "105", image: "img/canalmegatv.png", title: "MEGATV", file: "https://solo.disfrutaenlared.com:1936/tvcbba/tvcbba/playlist.m3u8" },
      { number: "106", image: "img/canalwowtv.png", title: "WOW TV", file: "https://cdn.elsalvadordigital.com:1936/wowtv/smil:wowtv.smil/playlist.m3u8" },
      { number: "107", image: "img/canalcocotv.png", title: "COCO TV", file: "https://cloudflare.streamgato.us:3253/live/canalcocotvlive.m3u8" },
      { number: "108", image: "img/canalsoltv.png", title: "SOL TV", file: "https://cdn.streamhispanatv.net:3409/live/soltvlive.m3u8" },
      { number: "109", image: "img/canalorbittv.png", title: "ORBIT TV", file: "https://ss3.domint.net:3134/otv_str/orbittv/playlist.m3u8" },
      { number: "110", image: "img/canalsonynovelas.png", title: "SONY NOVELAS", file: "https://a89829b8dca2471ab52ea9a57bc28a35.mediatailor.us-east-1.amazonaws.com/v1/master/0fb304b2320b25f067414d481a779b77db81760d/CanelaTV_SonyCanalNovelas/playlist.m3u8" },
      { number: "111", image: "img/canaldw.png", title: "DW ESPAÑOL", file: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8" },
      { number: "111", image: "img/canaldw.png", title: "DW ESPAÑOL", file: "http://livestreamcdn.net:1935/ExtremaTV/ExtremaTV/playlist.m3u8" },
      { number: "111", image: "img/canal-axn.png", title: "AXN", file: "http://181.78.109.48:8000/play/a05u/index.m3u8" },
      
  ];

  player.loadPlaylist(playlist);
});
