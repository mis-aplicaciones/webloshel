document.addEventListener("DOMContentLoaded", () => {
  const channelsContainer = document.querySelector(".channels-container");
  const timeContainer = document.querySelector(".time-container");
  const videoContainer = document.querySelector(".video-container");
  const channels = document.querySelectorAll(".channel-card");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const currentTimeSpan = document.getElementById("currentTime");
  let currentIndex = 0;
  let timeout;

  // Inicializar el reproductor
  const embed = new Twitch.Embed("twitch-embed", {
    width: "100%",
    height: "100%",
    channel: "sonnycc1",
    parent: [window.location.hostname],
    layout: "video",
    muted: false
  });

  // Actualizar la hora
  const updateClock = () => {
    const now = new Date();
    currentTimeSpan.textContent = now.toLocaleTimeString();
  };
  setInterval(updateClock, 1000);

  // Ocultar los contenedores tras 5 segundos
  const hideOverlay = () => {
    if (window.innerWidth > 1250) {
      channelsContainer.style.opacity = "0";
      timeContainer.style.opacity = "0";
    }
  };

  // Mostrar los contenedores
  const showOverlay = () => {
    channelsContainer.style.opacity = "1";
    timeContainer.style.opacity = "1";
    clearTimeout(timeout);
    timeout = setTimeout(hideOverlay, 5000); // Ocultar tras 5 segundos
  };

  // Forzar opacidad en pantallas grandes
  const enforceOpacity = () => {
    if (window.innerWidth > 1250) {
      channelsContainer.style.opacity = "1";
      timeContainer.style.opacity = "1";
    }
  };
  window.addEventListener("resize", enforceOpacity);
  enforceOpacity();

  // Actualizar el foco en los canales
  const updateFocus = () => {
    channels.forEach((channel, index) => {
      channel.classList.toggle("focused", index === currentIndex);
      if (index === currentIndex) {
        channel.focus();
      }
    });
  };

  // Navegación con teclado
  document.addEventListener("keydown", (e) => {
    showOverlay(); // Mostrar al interactuar
    switch (e.key) {
      case "ArrowDown":
        currentIndex = (currentIndex + 1) % channels.length;
        updateFocus();
        channels[currentIndex].scrollIntoView({ behavior: "smooth" });
        break;
      case "ArrowUp":
        currentIndex = (currentIndex - 1 + channels.length) % channels.length;
        updateFocus();
        channels[currentIndex].scrollIntoView({ behavior: "smooth" });
        break;
      case "Enter":
        const focusedChannel = channels[currentIndex];
        if (focusedChannel) {
          const channelName = focusedChannel.getAttribute("data-channel");
          embed.setChannel(channelName);
        }
        break;
    }
  });

  // Mostrar contenedores al pasar el ratón
  channelsContainer.addEventListener("mouseenter", showOverlay);
  timeContainer.addEventListener("mouseenter", showOverlay);

  // Hacer clic en canales
  channels.forEach((channel) => {
    channel.addEventListener("click", () => {
      const channelName = channel.getAttribute("data-channel");
      embed.setChannel(channelName);
    });
  });

  // Activar pantalla completa con el botón
  fullscreenBtn.addEventListener("click", () => {
    videoContainer.requestFullscreen();
  });

  // Enfocar el primer canal al iniciar
  updateFocus();
});
