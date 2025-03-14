document.addEventListener("DOMContentLoaded", () => {
  const channelsContainer = document.querySelector(".channels-container");
  const timeContainer = document.querySelector(".time-container");
  const videoContainer = document.querySelector(".video-container");
  const channels = document.querySelectorAll(".channel-card");
  const currentTimeSpan = document.getElementById("currentTime");
  const currentChannelNumber = document.getElementById("currentChannelNumber");
  const currentChannelDisplay = document.getElementById("currentChannelDisplay");
  let timeout;

  // Obtener el primer canal de la lista
  const initialChannelElement = channels[0];
  const initialChannel = initialChannelElement?.getAttribute("data-channel") || "default";
  const initialChannelNumber = initialChannelElement?.querySelector(".channel-number")?.textContent || "---";

  // Inicializar el reproductor de Twitch con el canal inicial
  const embed = new Twitch.Embed("twitch-embed", {
    width: "100%",
    height: "100%",
    channel: initialChannel,
    parent: [window.location.hostname],
    layout: "video",
    muted: false,
  });

  // Mostrar el primer canal en el display al cargar la web
  currentChannelNumber.textContent = initialChannelNumber;

  // Actualizar la hora en formato AM/PM sin segundos
  const updateClock = () => {
    const now = new Date();
    const options = { hour: "2-digit", minute: "2-digit", hour12: true };
    currentTimeSpan.textContent = now.toLocaleTimeString("en-US", options);
  };
  setInterval(updateClock, 1000);

  // Ocultar los contenedores tras 5 segundos
  const hideOverlay = () => {
    if (window.innerWidth > 720) {
      channelsContainer.style.opacity = "0";
      timeContainer.style.opacity = "0";
      currentChannelDisplay.style.opacity = "0";
    }
  };

  // Mostrar los contenedores
  const showOverlay = () => {
    channelsContainer.style.opacity = "1";
    timeContainer.style.opacity = "1";
    currentChannelDisplay.style.opacity = "1";
    resetInactivityTimeout();
  };

  // Reiniciar el temporizador de inactividad
  const resetInactivityTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(hideOverlay, 5000);
  };

  window.addEventListener("resize", showOverlay);
  document.addEventListener("mousemove", showOverlay);
  document.addEventListener("keydown", showOverlay);
  document.addEventListener("click", showOverlay);

  // Navegación por teclado
  document.addEventListener("keydown", (e) => {
    const currentFocus = document.activeElement;
    const currentIndex = Array.from(channels).indexOf(currentFocus);

    if (e.key === "ArrowDown" && currentIndex !== -1 && currentIndex < channels.length - 1) {
      channels[currentIndex + 1]?.focus();
    } else if (e.key === "ArrowUp" && currentIndex !== -1 && currentIndex > 0) {
      channels[currentIndex - 1]?.focus();
    } else if (e.key === "Enter" && currentIndex !== -1) {
      const channel = channels[currentIndex];
      const channelName = channel.getAttribute("data-channel");
      if (channelName) {
        embed.setChannel(channelName);
        const number = channel.querySelector(".channel-number").textContent;
        currentChannelNumber.textContent = number;
        showOverlay();
      }
    }
  });

  // Cambiar canal al hacer clic en un botón
  channels.forEach((channel) => {
    channel.addEventListener("click", () => {
      const channelName = channel.getAttribute("data-channel");
      if (channelName) {
        embed.setChannel(channelName);
        const number = channel.querySelector(".channel-number").textContent;
        currentChannelNumber.textContent = number;
        showOverlay();
      }
    });
  });

  // Mostrar contenedores al pasar el ratón sobre ellos
  channelsContainer.addEventListener("mouseenter", showOverlay);
  timeContainer.addEventListener("mouseenter", showOverlay);

  // Evitar que elementos no interactivos reciban foco
  channelsContainer.setAttribute("tabindex", "-1");
  timeContainer.setAttribute("tabindex", "-1");
  videoContainer.setAttribute("tabindex", "-1");

  // Eliminar borde amarillo en Android TV
  channels.forEach((channel) => {
    channel.style.outline = "none";
  });

  // Inicializar el foco en el primer canal
  channels[0]?.focus();

  // Inicializar mostrando los contenedores y configurando el temporizador inicial
  showOverlay();
});