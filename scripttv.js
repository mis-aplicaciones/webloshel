function initializeTv() {
  const cards = document.querySelectorAll(".card");
  let currentIndex = 0;
  let tvKeyListener;

  if (!cards.length) {
    console.error("No se encontraron cards en tv.html.");
    return;
  }

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

  const applyStylesForIndex = () => {
    const container = document.querySelector(".tv-grid-container");
    if (container) {
      container.style.display = "grid";
      container.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
    }
  };

  tvKeyListener = (e) => {
    const cols = Math.floor(window.innerWidth / 170);
    switch (e.key) {
      case "ArrowRight":
        if ((currentIndex + 1) < cards.length) currentIndex++;
        break;
      case "ArrowLeft":
        if ((currentIndex % cols) > 0) currentIndex--;
        
        break;
      case "ArrowDown":
        if (currentIndex + cols < cards.length) currentIndex += cols;
        break;
      case "ArrowUp":
        if (currentIndex - cols >= 0) currentIndex -= cols;
        break;
      case "Enter":
        handleCardAction(cards[currentIndex]);
        return;
      case "Backspace":
      case "Escape":
        handleReturnToIndex();
        return;
      default:
        break;
    }
    updateFocus();
  };

  const handleCardAction = (card) => {
    const link = card.getAttribute("data-link");
    if (link) window.location.href = link;
  };

  const handleReturnToIndex = () => {
    cards.forEach((card) => {
      card.classList.remove("focused");
      card.setAttribute("tabindex", "-1");
    });
    currentIndex = 0;

    // Focus solo al ícono de TV
    const tvMenu = document.querySelector('.menu-item[data-section="tv.html"]');
    if (tvMenu) {
      // Eliminar otros focus activos
      document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
      tvMenu.classList.add("active");
      tvMenu.focus();
    }

    cleanupTv();
  };

  const cleanupTv = () => {
    document.removeEventListener("keydown", tvKeyListener);
  };

  cards.forEach((card, index) => {
    card.addEventListener("click", () => handleCardAction(card));
    card.addEventListener("focus", () => {
      currentIndex = index;
      updateFocus();
    });
    card.addEventListener("touchend", (e) => {
      e.preventDefault();
      handleCardAction(card);
    });
  });

  document.addEventListener("keydown", tvKeyListener);
  applyStylesForIndex();
  updateFocus();
  window.cleanupTv = cleanupTv;
}