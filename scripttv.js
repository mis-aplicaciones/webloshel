function initializeTv() {
  const cards = Array.from(document.querySelectorAll('.tv-card'));
  let current = 0, locked = false;

  cards.forEach((c,i) => c.setAttribute('tabindex', i === 0 ? 0 : -1));

  const focusCard = (index) => {
    cards[current].classList.remove('focused');
    cards[current].setAttribute('tabindex', '-1');
    current = index;
    cards[current].setAttribute('tabindex', '0');
    cards[current].classList.add('focused');
    cards[current].focus();
  };

  const getNeighbor = (index, delta) => {
    let target = index + delta;
    return (target >= 0 && target < cards.length) ? target : index;
  };

  const keyHandler = (e) => {
    if (locked) return;
    const cols = calculateColumns();
    let target = current;
    switch (e.key) {
      case 'ArrowRight': target = getNeighbor(current, +1); break;
      case 'ArrowLeft':  target = getNeighbor(current, -1); break;
      case 'ArrowDown':  target = getNeighbor(current, +cols); break;
      case 'ArrowUp':    target = getNeighbor(current, -cols); break;
      case 'Enter':      window.location.href = cards[current].dataset.link; return;
      case 'Backspace':
      case 'Escape':     cleanupTv(); navigateToSidebar(); return;
    }
    if (target !== current) focusCard(target);
  };

  const calculateColumns = () => {
    const grid = document.querySelector('.tv-grid');
    const styles = window.getComputedStyle(grid);
    const columnCount = styles.getPropertyValue('grid-template-columns').split(' ').length;
    return columnCount;
  };

  document.addEventListener('keydown', keyHandler);
  cards.forEach((card, i) => card.addEventListener('click', () => focusCard(i)));
  focusCard(0);

  window.cleanupTv = () => {
    locked = true;
    document.removeEventListener('keydown', keyHandler);
  };
}

function navigateToSidebar() {
  const event = new CustomEvent('return-to-sidebar');
  window.dispatchEvent(event);
}