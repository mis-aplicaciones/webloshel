function initializeTv() {
  const cards = document.querySelectorAll(".card");
  let currentIndex = 0;
  let tvKeyListener;

  if (!cards.length) {
    console.error("No se encontraron cards en tv.html.");
    return;
  }

  // Función para actualizar el foco
  const updateFocus = () => {
    cards.forEach((card, index) => {
      if (index === currentIndex) {
        card.classList.add("focused");
        card.setAttribute("tabindex", "0");
        card.focus();
      } else {
        card.classList.remove("focused");
        card.setAttribute("tabindex", "-1");
      }
    });
  };

  // Función para asegurarse de que los estilos se carguen correctamente
  const applyStylesForIndex = () => {
    const container = document.querySelector(".tv-grid-container");
    if (container) {
      container.style.display = "grid";
      container.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
    }
  };

  // Manejar navegación por teclado
  tvKeyListener = (e) => {
    const cols = Math.floor(window.innerWidth / 170);
    switch (e.key) {
      case "ArrowRight":
        if ((currentIndex + 1) % cols !== 0 && currentIndex < cards.length - 1) {
          currentIndex++;
        }
        break;
      case "ArrowLeft":
        if (currentIndex % cols !== 0 && currentIndex > 0) {
          currentIndex--;
        }
        break;
      case "ArrowDown":
        if (currentIndex + cols < cards.length) {
          currentIndex += cols;
        }
        break;
      case "ArrowUp":
        if (currentIndex - cols >= 0) {
          currentIndex -= cols;
        }
        break;
      case "Enter":
        handleCardAction(cards[currentIndex]);
        break;
      case "Backspace":
      case "Escape":
        handleReturnToIndex();
        break;
      default:
        break;
    }
    updateFocus();
  };

  // Evento de clic para cada card
  cards.forEach((card, index) => {
    card.addEventListener("click", () => {
      handleCardAction(card);
    });

    card.addEventListener("focus", () => {
      currentIndex = index;
      updateFocus();
    });
  });

  // Acción al interactuar con un card
  const handleCardAction = (card) => {
    const link = card.getAttribute("data-link");
    if (link) {
      window.location.href = link;
    }
  };

  // Función corregida para regresar al index correctamente
  const handleReturnToIndex = () => {
    console.log("Retornando al index...");
    const indexButtons = document.querySelectorAll(".menu-item, .index-button");
    if (indexButtons.length) {
      indexButtons[0].focus(); // Regresar al primer botón disponible en el index
    }
    cleanupTv(); // Limpieza al regresar
  };

  // Limpieza del script
  const cleanupTv = () => {
    console.log("Limpiando eventos de TV...");
    document.removeEventListener("keydown", tvKeyListener);
    cards.forEach((card) => {
      card.removeEventListener("click", () => {});
      card.removeEventListener("focus", () => {});
    });
  };

  // Inicialización
  document.addEventListener("keydown", tvKeyListener);
  applyStylesForIndex();
  updateFocus();
  console.log("TV inicializado correctamente");

  window.cleanupTv = cleanupTv;
}
