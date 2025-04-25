function initializeTv() {
  const cards = document.querySelectorAll(".card");
  const container = document.querySelector(".card-container");
  const background = document.getElementById("tv-background");
  let currentIndex = 0;

  const updateFocus = () => {
    cards.forEach((card, i) => {
      card.classList.remove("focused");
      card.setAttribute("tabindex", "-1");
    });
    const focused = cards[currentIndex];
    focused.classList.add("focused");
    focused.setAttribute("tabindex", "0");
    focused.focus();

    // Actualizar fondo con transición suave
    const bg = focused.dataset.bg;
    if (bg) {
      background.style.filter = 'brightness(0.5)';
      setTimeout(() => {
        background.style.backgroundImage = `url('${bg}')`;
        background.style.filter = 'brightness(1)';
      }, 100);
    }

    // Desplazar cards
    const offset = currentIndex * (focused.offsetWidth + 24);
    container.style.transform = `translateX(${-offset}px)`;
  };

  const handleCardAction = (card) => {
    const link = card.dataset.link;
    if (link) window.location.href = link;
  };

  const handleReturnToSidebar = () => {
    // Desactivar foco TV
    cards.forEach(card => {
      card.classList.remove("focused");
      card.setAttribute("tabindex", "-1");
    });
    // Restaurar foco menu
    const menuTV = document.querySelector('.menu-item[data-section="tv.html"]');
    if (menuTV) {
      document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
      menuTV.classList.add('active');
      window.currentFocus = 'menu';
      menuTV.focus();
    }
    cleanupTv();
  };

  const tvKeyListener = (e) => {
    switch(e.key) {
      case 'ArrowRight':
        if (currentIndex < cards.length - 1) currentIndex++;
        break;
      case 'ArrowLeft':
        if (currentIndex > 0) currentIndex--;
        
        break;
      case 'Enter':
        handleCardAction(cards[currentIndex]);
        return;
      case 'Backspace':
      case 'Escape':
        handleReturnToSidebar();
        return;
    }
    updateFocus();
  };

  const cleanupTv = () => {
    document.removeEventListener('keydown', tvKeyListener, true);
  };

  // Listeners
  cards.forEach((card, i) => {
    card.addEventListener('click', () => handleCardAction(card));
    card.addEventListener('focus', () => { currentIndex = i; updateFocus(); });
    card.addEventListener('touchend', e => { e.preventDefault(); handleCardAction(card); });
  });

  // Capturar primero para no interferir con script.js
  document.addEventListener('keydown', tvKeyListener, true);
  updateFocus();
  window.cleanupTv = cleanupTv;
}
window.addEventListener('load', initializeTv);