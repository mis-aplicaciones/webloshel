function initializeTv() {
  const cards = Array.from(document.querySelectorAll('.card'));
  const rowLengths = [4, 5];
  let currentIndex = 0;

  cards.forEach((card, i) => card.setAttribute('tabindex', i === 0 ? '0' : '-1'));

  function updateFocus() {
    // ...igual que antes...
  }

  function findNeighbor(key) {
    // ...igual que antes...
  }

  function tvKeyListener(e) {
    let next = null;
    switch (e.key) {
      case 'ArrowRight':
        next = findNeighbor('ArrowRight');
        break;
      case 'ArrowLeft': {
        const n = findNeighbor('ArrowLeft');
        if (n != null) {
          next = n;
        } else {
          cleanupTv();
          // dejamos propagar ArrowLeft para que script.js lo capture
        }
        break;
      }
      case 'ArrowDown':
        next = findNeighbor('ArrowDown');
        break;
      case 'ArrowUp':
        next = findNeighbor('ArrowUp');
        break;
      case 'Enter':
        window.location.href = cards[currentIndex].dataset.link;
        return;
      case 'Backspace':
      case 'Escape':
        cleanupTv();
        // dejamos propagar para script.js
        return;
    }

    if (next != null) {
      e.preventDefault();
      currentIndex = next;
      updateFocus();
      cards[currentIndex].scrollIntoView({ block: 'center', inline: 'center' });
    }
  }

  document.addEventListener('keydown', tvKeyListener);
  // ... click/touch handlers ...
  updateFocus();

  window.cleanupTv = () => {
    document.removeEventListener('keydown', tvKeyListener);
    cards.forEach(card => card.classList.remove('focused'));
  };
}

window.addEventListener('load', initializeTv);
