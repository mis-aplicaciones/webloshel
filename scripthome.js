function initializeHome() {
  const homeContainer = document.querySelector(".home-container");
  const cards         = document.querySelectorAll(".card");
  const background    = document.querySelector(".background");
  const infoGrid      = document.querySelector(".info-grid");
  const carousels     = document.querySelectorAll(".carousel-container");

  if (!homeContainer || !cards.length || !background || !infoGrid || !carousels.length) {
    console.error("Faltan elementos esenciales en home.html.");
    return;
  }

  // Hacemos no-navegables ciertos contenedores
  [background, infoGrid].forEach(el => el.setAttribute("tabindex", "-1"));

  // Efecto inicial en el primer card
  const initializeFirstCard = () => {
    const first = cards[0];
    first.focus();
    updateBackground(first);
    updateInfoGrid(first);
    first.classList.add("active-card");
  };

  const updateBackground = card => {
    const img = card.dataset.background;
    if (img) background.style.backgroundImage = `url(${img})`;
  };

  const updateInfoGrid = card => {
    infoGrid.classList.remove("active");
    setTimeout(() => {
      // Extraemos atributos…
      const title = card.dataset.title || "";
      const age   = card.dataset.edad  || "N/A";
      const year  = card.dataset.año   || "N/A";
      const hrs   = card.dataset.duracionHoras   || "N/A";
      const mins  = card.dataset.duracionMinutos || "N/A";
      const genres = (card.dataset.genre || "").split(",").map(g => g.trim());

      infoGrid.querySelector(".info-title img").src = title;
      infoGrid.querySelector(".info-item h4").innerHTML = `
        <span id="edad">${age}</span>
        <span id="año">${year}</span>
        <span id="duracion-horas">${hrs}</span>
        <span id="duracion-minutos">${mins}</span>
      `;
      const genreContainer = infoGrid.querySelector(".info-genero");
      genreContainer.innerHTML = "";
      genres.forEach(g => {
        const d = document.createElement("div");
        d.classList.add("genre");
        d.textContent = g;
        genreContainer.appendChild(d);
      });
      infoGrid.classList.add("active");
    }, 300);
  };

  // Asegura que el card enfocado quede a la vista
  function ensureCardVisibility(card) {
    const track = card.closest(".carousel-track");
    if (!track) return;
    const cRect = card.getBoundingClientRect();
    const tRect = track.getBoundingClientRect();
    if (cRect.left < tRect.left)
      track.scrollLeft -= (tRect.left - cRect.left) + 20;
    if (cRect.right > tRect.right)
      track.scrollLeft += (cRect.right - tRect.right) + 20;
  }

  // Acción de “salir al sidebar”: despacha el evento genérico
  const returnToSidebar = () => {
    cards.forEach(c => {
      c.classList.remove("active-card");
      c.blur();
    });
    window.dispatchEvent(new Event("return-to-sidebar"));
  };

  // Wiring de carruseles
  carousels.forEach((carousel, idx) => {
    const track = carousel.querySelector(".carousel-track");
    const nextB = carousel.querySelector(".nav-button.next");
    const prevB = carousel.querySelector(".nav-button.prev");

    nextB.addEventListener("click", () => {
      const max = track.scrollWidth - track.clientWidth;
      track.scrollLeft = Math.min(track.scrollLeft + cards[0].offsetWidth + 20, max);
    });
    prevB.addEventListener("click", () => {
      track.scrollLeft = Math.max(track.scrollLeft - cards[0].offsetWidth - 20, 0);
    });

    carousel.addEventListener("keydown", e => {
      const focused = document.activeElement;

      switch (e.key) {
        case "ArrowRight":
          if (focused.nextElementSibling) focused.nextElementSibling.focus();
          break;
        case "ArrowLeft":
          if (focused.previousElementSibling) {
            focused.previousElementSibling.focus();
          } else {
            // En primer card → salir
            returnToSidebar();
          }
          break;
        case "ArrowDown":
          if (carousels[idx + 1]) {
            const nextCards = carousels[idx + 1].querySelectorAll(".card");
            nextCards[0]?.focus();
          }
          break;
        case "ArrowUp":
          if (carousels[idx - 1]) {
            const prevCards = carousels[idx - 1].querySelectorAll(".card");
            prevCards[0]?.focus();
          }
          break;
        case "Enter":
          const link = focused.querySelector("a");
          if (link) window.location.href = link.href;
          break;
        case "Backspace":
        case "Escape":
          // Teclas de vuelta directa
          returnToSidebar();
          break;
      }
    });
  });

  // Eventos de hover/focus/click sobre los cards
  cards.forEach(card => {
    card.addEventListener("mouseenter", () => {
      updateBackground(card);
      updateInfoGrid(card);
      card.classList.add("active-card");
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("active-card");
    });
    card.addEventListener("focus", () => {
      updateBackground(card);
      updateInfoGrid(card);
      card.classList.add("active-card");
      ensureCardVisibility(card);
    });
    card.addEventListener("blur", () => {
      card.classList.remove("active-card");
    });
    card.addEventListener("click", () => {
      const a = card.querySelector("a");
      if (a) window.location.href = a.href;
    });
  });

  // Quitar outline amarillo de Android TV
  const style = document.createElement("style");
  style.textContent = `
    *:focus { outline: none; }
    .active-card:focus { outline: 2px solid white; }
    .nav-button:focus { outline: 2px solid white; }
  `;
  document.head.appendChild(style);

  // Arrancamos
  initializeFirstCard();
  console.log("Home inicializado correctamente");
    // ** funciones para slider **
    document.addEventListener("DOMContentLoaded", () => {
      const slider = document.querySelector(".carousel-wrapper");
      const items = document.querySelectorAll(".carousel-item");
      const dots = document.querySelectorAll(".pagination .dot");
      const itemCount = items.length;
      let activeIndex = 0;
      let isScrolling = false;
    
      // Actualizar el estado activo de los dots
      const updateDots = () => {
        dots.forEach((dot, index) => {
          dot.classList.toggle("active", index === activeIndex);
        });
      };
    
      // Mover el carrusel al card correspondiente
      const scrollToItem = (index) => {
        if (isScrolling) return; // Evitar múltiples desplazamientos simultáneos
        isScrolling = true;
    
        activeIndex = index;
        slider.scrollTo({
          left: items[activeIndex].offsetLeft,
          behavior: "smooth",
        });
    
        updateDots();
    
        setTimeout(() => {
          isScrolling = false;
        }, 600); // Tiempo de transición
      };
    
      // Cambiar al siguiente card
      const goToNext = () => {
        if (activeIndex < itemCount - 1) {
          scrollToItem(activeIndex + 1);
        } else {
          scrollToItem(0); // Volver al inicio
        }
      };
    
      // Cambiar al card anterior
      const goToPrev = () => {
        if (activeIndex > 0) {
          scrollToItem(activeIndex - 1);
        } else {
          scrollToItem(itemCount - 1); // Ir al final
        }
      };
    
      // Manejar clics en los dots
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          scrollToItem(index);
        });
      });
    
      // Soporte para gestos táctiles
      let startX = 0;
    
      slider.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
      });
    
      slider.addEventListener("touchend", (e) => {
        const endX = e.changedTouches[0].clientX;
    
        if (startX > endX + 50) goToNext(); // Deslizar hacia la izquierda
        else if (startX < endX - 50) goToPrev(); // Deslizar hacia la derecha
      });
    
      // Auto-scroll cada 5 segundos
      setInterval(() => {
        goToNext();
      }, 5000);
    
      // Inicializar estado de los dots
      updateDots();
    });
    
    console.log("Home inicializado correctamente");
  }


