function initializeTv() {
  const cards = Array.from(document.querySelectorAll('.tv-card'));
  let current = 0, locked = false;

  cards.forEach((c, i) => c.setAttribute('tabindex', i === 0 ? 0 : -1));

  const focusCard = (index) => {
    cards[current].classList.remove('focused');
    cards[current].setAttribute('tabindex', '-1');
    current = index;
    cards[current].setAttribute('tabindex', '0');
    cards[current].classList.add('focused');
    cards[current].focus();
  };

  const keyHandler = (e) => {
    if (locked) return;
    let nextIndex = null;
    switch (e.key) {
      case 'ArrowRight': nextIndex = findCard(current, 'right'); break;
      case 'ArrowLeft': nextIndex = findCard(current, 'left'); break;
      case 'ArrowDown': nextIndex = findCard(current, 'down'); break;
      case 'ArrowUp': nextIndex = findCard(current, 'up'); break;
      case 'Enter': window.location.href = cards[current].dataset.link; return;
      case 'Backspace':
      case 'Escape': cleanupTv(); navigateToSidebar(); return;
    }
    if (nextIndex !== null) focusCard(nextIndex);
  };

  function findCard(currentIndex, direction) {
    const origin = cards[currentIndex].getBoundingClientRect();
    let target = null;
    let minDistance = Infinity;

    for (let i = 0; i < cards.length; i++) {
      if (i === currentIndex) continue;
      const rect = cards[i].getBoundingClientRect();
      let isValid = false;
      let distance = Infinity;

      switch (direction) {
        case 'right':
          isValid = rect.left > origin.left && Math.abs(rect.top - origin.top) < origin.height;
          distance = rect.left - origin.left;
          break;
        case 'left':
          isValid = rect.left < origin.left && Math.abs(rect.top - origin.top) < origin.height;
          distance = origin.left - rect.left;
          break;
        case 'down':
          isValid = rect.top > origin.top && Math.abs(rect.left - origin.left) < origin.width;
          distance = rect.top - origin.top;
          break;
        case 'up':
          isValid = rect.top < origin.top && Math.abs(rect.left - origin.left) < origin.width;
          distance = origin.top - rect.top;
          break;
      }

      if (isValid && distance < minDistance) {
        minDistance = distance;
        target = i;
      }
    }
    return target;
  }

  function cleanupTv() {
    locked = true;
    document.removeEventListener('keydown', keyHandler);
  }

  document.addEventListener('keydown', keyHandler);
  cards.forEach((card, i) => card.addEventListener('click', () => focusCard(i)));
  focusCard(0);
}

function navigateToSidebar() {
  const event = new CustomEvent('return-to-sidebar');
  window.dispatchEvent(event);
}