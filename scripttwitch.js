document.addEventListener("DOMContentLoaded", () => {
  const channelsContainer = document.querySelector(".channels-container");
  const timeContainer = document.querySelector(".time-container");
  const videoContainer = document.querySelector(".video-container");
  const channels = document.querySelectorAll(".channel-card");
  const currentTimeSpan = document.getElementById("currentTime");
  let timeout;

  // Obtener el nombre del canal inicial desde el primer botón de canales
  const initialChannel = channels[0]?.getAttribute("data-channel") || "default";

  // Inicializar el reproductor de Twitch con el canal inicial
  const embed = new Twitch.Embed("twitch-embed", {
    width: "100%",
    height: "100%",
    channel: initialChannel,
    parent: [window.location.hostname],
    layout: "video",
    muted: false,
  });

  // Actualizar la hora en formato AM/PM
  const updateClock = () => {
    const now = new Date();
    const options = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true };
    currentTimeSpan.textContent = now.toLocaleTimeString("en-US", options);
  };
  setInterval(updateClock, 1000);

  // Ocultar los contenedores tras 5 segundos
  const hideOverlay = () => {
    const screenWidth = window.innerWidth;
    if (screenWidth > 720) {
      channelsContainer.style.opacity = "0";
      timeContainer.style.opacity = "0";
    }
  };

  // Mostrar los contenedores
  const showOverlay = () => {
    channelsContainer.style.opacity = "1";
    timeContainer.style.opacity = "1";
    resetInactivityTimeout();
  };

  // Reiniciar el temporizador de inactividad
  const resetInactivityTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(hideOverlay, 5000); // Ocultar tras 5 segundos de inactividad
  };

  // Forzar opacidad para pantallas menores a 720px
  const enforceOpacity = () => {
    const screenWidth = window.innerWidth;
    if (screenWidth <= 720) {
      channelsContainer.style.opacity = "1"; // Siempre visible en pantallas pequeñas
      timeContainer.style.opacity = "1"; // Opcional si aplica
      clearTimeout(timeout); // No ocultar en pantallas pequeñas
    } else {
      showOverlay(); // Asegurar que aparezca en otras pantallas
    }
  };

  // Detectar cambios de tamaño de ventana
  window.addEventListener("resize", enforceOpacity);
  enforceOpacity();

  // Mostrar contenedores al interactuar con el mouse o teclado
  const handleUserActivity = () => {
    showOverlay();
  };

  document.addEventListener("mousemove", handleUserActivity);
  document.addEventListener("keydown", handleUserActivity);
  document.addEventListener("click", handleUserActivity);

  // Navegación por teclado
  document.addEventListener("keydown", (e) => {
    const currentFocus = document.activeElement;
    const currentIndex = Array.from(channels).indexOf(currentFocus);

    if (e.key === "ArrowDown" && currentIndex !== -1 && currentIndex < channels.length - 1) {
      // Mover foco al siguiente botón si no está en el último
      channels[currentIndex + 1]?.focus();
    } else if (e.key === "ArrowUp" && currentIndex !== -1 && currentIndex > 0) {
      // Mover foco al botón anterior si no está en el primero
      channels[currentIndex - 1]?.focus();
    } else if (e.key === "Enter" && currentIndex !== -1) {
      // Cambiar canal en el reproductor si se presiona Enter
      const channelName = channels[currentIndex].getAttribute("data-channel");
      if (channelName) {
        embed.setChannel(channelName);
      }
    }
  });

  // Cambiar canal al hacer clic en un botón
  channels.forEach((channel) => {
    channel.addEventListener("click", () => {
      const channelName = channel.getAttribute("data-channel");
      if (channelName) {
        embed.setChannel(channelName);
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

  // Inicializar el foco en el primer canal
  channels[0]?.focus();

  // Inicializar mostrando los contenedores y configurando el temporizador inicial
  showOverlay();
});
