function initializeTv() {
  const cards = document.querySelectorAll(".card");
  const container = document.querySelector(".card-container");
  const background = document.getElementById("tv-background");
  let currentIndex = 0;
  let tvKeyListener;

  if (!cards.length) {
    console.error("No se encontraron cards en tv.html.");
    return;
  }

  // Función para actualizar el foco
  const updateFocus = () => {
    cards.forEach((card) => {
      card.classList.remove("focused");
      card.setAttribute("tabindex", "-1");
    });
    const focused = cards[currentIndex];
    if (focused) {
      focused.classList.add("focused");
      focused.setAttribute("tabindex", "0");
      focused.focus();

      // Actualizar fondo con transición suave
      const bg = focused.dataset.bg;
      if (bg && background) {
        background.style.filter = 'brightness(0.5)';
        setTimeout(() => {
          background.style.backgroundImage = `url('${bg}')`;
          background.style.filter = 'brightness(1)';
        }, 100);
      }

      // Desplazar cards
      if (container) {
        const offset = currentIndex * (focused.offsetWidth + 24);
        container.style.transform = `translateX(${-offset}px)`;
      }
    }
  };

  // Asegurar estilos de grilla
  const applyStylesForIndex = () => {
    const grid = document.querySelector(".tv-grid-container");
    if (grid) {
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
    }
  };

  // Acción al interactuar con un card
  const handleCardAction = (card) => {
    const link = card.getAttribute("data-link");
    if (link) {
      window.location.href = link;
    }
  };

  // Regresar al índice (sidebar) y desactivar foco en cards
  const handleReturnToIndex = () => {
    console.log("Retornando al index...");
    // Desactivar foco en todos los cards
    cards.forEach((card) => {
      card.classList.remove("focused");
      card.setAttribute("tabindex", "-1");
      card.blur();
    });
    // Enfocar primer elemento del menú o índice
    const indexButtons = document.querySelectorAll(".menu-item, .index-button");
    if (indexButtons.length) {
      indexButtons[0].focus();
    }
    cleanupTv();
  };

  // Limpieza de eventos
  const cleanupTv = () => {
    console.log("Limpiando eventos de TV...");
    document.removeEventListener("keydown", tvKeyListener);
  };

  // Manejo de teclas remoto
  tvKeyListener = (e) => {
    const cols = Math.floor(window.innerWidth / 170) || 1;
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
        return; // evitar updateFocus después de salir
      default:
        break;
    }
    updateFocus();
  };

  // Eventos de clic y focus en cards
  cards.forEach((card, index) => {
    card.addEventListener("click", () => handleCardAction(card));
    card.addEventListener("focus", () => {
      currentIndex = index;
      updateFocus();
    });
  });

  // Inicializar
  document.addEventListener("keydown", tvKeyListener);
  applyStylesForIndex();
  updateFocus();
  console.log("TV inicializado correctamente");

  // Exponer limpieza global
  window.cleanupTv = cleanupTv;
}
