function initializeTv() {
  const cards = Array.from(document.querySelectorAll('.card'));
  const rowLengths = [4, 5];
  let currentIndex = 0;

  if (!cards.length) { console.error('No se encontraron cards en tv.html.'); return; }

  cards.forEach((card, i) => card.setAttribute('tabindex', i === 0 ? '0' : '-1'));

  function updateFocus() {
    cards.forEach((card, i) => {
      card.classList.toggle('focused', i === currentIndex);
      card.setAttribute('tabindex', i === currentIndex ? '0' : '-1');
      if (i === currentIndex) card.focus();
    });
  }

  function findNeighbor(key) {
    const row0 = rowLengths[0];
    const total = cards.length;
    const inRow = currentIndex < row0 ? 0 : 1;
    const col = inRow === 0 ? currentIndex : currentIndex - row0;
    let target = null;

    if (key === 'ArrowRight') {
      if (inRow === 0 && col < row0 - 1) target = currentIndex + 1;
      if (inRow === 1 && col < rowLengths[1] - 1) target = currentIndex + 1;
    }
    if (key === 'ArrowLeft') {
      if (col > 0) target = currentIndex - 1;
      else if (inRow === 1) target = row0 - 1; // volver a última de row0
    }
    if (key === 'ArrowDown' && inRow === 0) {
      target = row0 + Math.min(col, rowLengths[1] - 1);
    }
    if (key === 'ArrowUp' && inRow === 1) {
      target = col;
    }
    return (target >= 0 && target < total) ? target : null;
  }

  function tvKeyListener(e) {
    let next = null;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); next = findNeighbor('ArrowRight'); break;
      case 'ArrowLeft':  e.preventDefault(); next = findNeighbor('ArrowLeft'); break;
      case 'ArrowDown':  e.preventDefault(); next = findNeighbor('ArrowDown'); break;
      case 'ArrowUp':    e.preventDefault(); next = findNeighbor('ArrowUp'); break;
      case 'Enter':      e.preventDefault(); window.location.href = cards[currentIndex].dataset.link; return;
      case 'Backspace':
      case 'Escape':     e.preventDefault(); window.cleanupTv(); window.dispatchEvent(new CustomEvent('return-to-sidebar')); return;
    }
    if (next !== null) {
      currentIndex = next;
      updateFocus();
      cards[currentIndex].scrollIntoView({ block: 'center', inline: 'center' });
    }
  }

  // click y touch
  cards.forEach((card, i) => {
    card.addEventListener('click', () => window.location.href = card.dataset.link);
    card.addEventListener('touchend', () => window.location.href = card.dataset.link);
  });

  document.addEventListener('keydown', tvKeyListener);
  updateFocus();

  window.cleanupTv = () => {
    document.removeEventListener('keydown', tvKeyListener);
    cards.forEach(card => card.classList.remove('focused'));
  };
}

window.addEventListener('load', initializeTv);
