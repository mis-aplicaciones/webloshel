function initializeTv() {
  const cards = [...document.querySelectorAll('.tv-card')];
  let current = 0, locked = false;

  // Roving tabindex
  cards.forEach((c,i) => c.setAttribute('tabindex', i === 0 ? '0' : '-1'));

  // Enfocar y scroll
  function focusCard(idx) {
    cards[current].classList.remove('focused');
    cards[current].setAttribute('tabindex', '-1');
    current = idx;
    cards[current].setAttribute('tabindex', '0');
    cards[current].classList.add('focused');
    cards[current].focus();
    cards[current].scrollIntoView({ block: 'center', inline: 'center' });
  }

  // Encontrar vecino segun dirección
  function findNeighbor(direction) {
    const origin = cards[current].getBoundingClientRect();
    let best = { idx: null, dist: Infinity };
    cards.forEach((card, i) => {
      if (i === current) return;
      const r = card.getBoundingClientRect();

      let valid = false, d = Infinity;
      if (direction === 'right' && r.left > origin.left) {
        d = r.left - origin.left;
        valid = Math.abs(r.top - origin.top) < origin.height;
      }
      if (direction === 'left' && r.left < origin.left) {
        d = origin.left - r.left;
        valid = Math.abs(r.top - origin.top) < origin.height;
      }
      if (direction === 'down' && r.top > origin.top) {
        d = r.top - origin.top;
        valid = Math.abs(r.left - origin.left) < origin.width;
      }
      if (direction === 'up' && r.top < origin.top) {
        d = origin.top - r.top;
        valid = Math.abs(r.left - origin.left) < origin.width;
      }
      if (valid && d < best.dist) best = { idx: i, dist: d };
    });
    return best.idx;
  }

  // Manejo de teclas con preventDefault para no propagar
  function keyHandler(e) {
    if (locked) return;
    let next = null;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); next = findNeighbor('right'); break;
      case 'ArrowLeft':  e.preventDefault(); next = findNeighbor('left');  break;
      case 'ArrowDown':  e.preventDefault(); next = findNeighbor('down');  break;
      case 'ArrowUp':    e.preventDefault(); next = findNeighbor('up');    break;
      case 'Enter':      e.preventDefault(); window.location.href = cards[current].dataset.link; return;
      case 'Backspace':
      case 'Escape':
        e.preventDefault(); e.stopPropagation();
        cleanupTv(); navigateToSidebar();
        return;
    }
    if (next !== null) focusCard(next);
  }

  // Click en PC: navegar directamente
  cards.forEach((card, i) => {
    card.addEventListener('click', e => {
      e.preventDefault();
      window.location.href = card.dataset.link;
    });
    card.addEventListener('touchend', e => {
      e.preventDefault();
      window.location.href = card.dataset.link;
    });
  });

  document.addEventListener('keydown', keyHandler, true);
  focusCard(0);

  function cleanupTv() {
    locked = true;
    document.removeEventListener('keydown', keyHandler, true);
  }
}

function navigateToSidebar() {
  window.dispatchEvent(new CustomEvent('return-to-sidebar'));
}

// Inicializar
window.addEventListener('load', initializeTv);