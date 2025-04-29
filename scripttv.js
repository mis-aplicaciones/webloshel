// scripttv.js
function initializeTv() {
  const cards       = document.querySelectorAll(".card");
  const container   = document.querySelector(".card-container");
  const background  = document.getElementById("tv-background");
  let   currentIndex = 0;
  let   tvKeyListener;

  if (!cards.length) {
    console.error("No se encontraron cards en tv.html.");
    return;
  }

  const updateFocus = () => {
    cards.forEach((c) => {
      c.classList.remove("focused");
      c.setAttribute("tabindex", "-1");
    });
    const focused = cards[currentIndex];
    focused.classList.add("focused");
    focused.setAttribute("tabindex", "0");
    focused.focus();

    // Fondo con transición
    const bg = focused.dataset.bg;
    if (bg && background) {
      background.style.filter = "brightness(0.5)";
      setTimeout(() => {
        background.style.backgroundImage = `url('${bg}')`;
        background.style.filter = "brightness(1)";
      }, 100);
    }

    // Scroll horizontal
    if (container) {
      const offset = currentIndex * (focused.offsetWidth + 24);
      container.style.transform = `translateX(${-offset}px)`;
    }
  };

  const handleCardAction = (card) => {
    const link = card.dataset.link;
    if (link) window.location.href = link;
  };

  // 👉 Al salir de la sección TV, disparar evento genérico
  const handleReturnToIndex = () => {
    // Desactivar foco de todos los cards
    cards.forEach(c => {
      c.classList.remove("focused");
      c.setAttribute("tabindex", "-1");
      c.blur();
    });
    // Disparo de evento para el sidebar
    window.dispatchEvent(new Event("return-to-sidebar"));
    cleanupTv();
  };

  const cleanupTv = () => {
    document.removeEventListener("keydown", tvKeyListener);
  };

  tvKeyListener = (e) => {
    const cols = Math.floor(window.innerWidth / 170) || 1;

    switch (e.key) {
      case "ArrowRight":
        if ((currentIndex + 1) % cols !== 0 && currentIndex < cards.length - 1) {
          currentIndex++;
        }
        break;

      case "ArrowLeft":
        if (currentIndex === 0) {
          e.preventDefault();
          return handleReturnToIndex();
        }
        if (currentIndex % cols !== 0) {
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
        e.preventDefault();
        return handleReturnToIndex();

      default:
        return;
    }

    updateFocus();
  };

  // Eventos click y focus para cada card
  cards.forEach((card, i) => {
    card.addEventListener("click", () => handleCardAction(card));
    card.addEventListener("focus", () => {
      currentIndex = i;
      updateFocus();
    });
  });

  document.addEventListener("keydown", tvKeyListener);
  updateFocus();
  console.log("TV inicializado correctamente");

  window.cleanupTv = cleanupTv;
}
