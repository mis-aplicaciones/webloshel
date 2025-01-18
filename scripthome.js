function initializeHome() {
  const homeContainer = document.querySelector(".home-container");
  const cards = document.querySelectorAll(".card");
  const background = document.querySelector(".background");
  const infoGrid = document.querySelector(".info-grid");
  const carousels = document.querySelectorAll(".carousel-container");

  if (!homeContainer || !cards.length || !background || !infoGrid || !carousels.length) {
    console.error("Faltan elementos esenciales en home.html.");
    return;
  }

  let isReturningToSidebar = false;

  // ** Hacer elementos no interactivos no navegables **
  const nonInteractiveElements = [background, infoGrid];
  nonInteractiveElements.forEach((element) => {
    if (element) {
      element.setAttribute("tabindex", "-1");
    }
  });

  // ** Inicializar el primer card **
  const initializeFirstCard = () => {
    const firstCard = cards[0];
    if (firstCard) {
      firstCard.focus();
      updateBackground(firstCard);
      updateInfoGrid(firstCard);
      firstCard.classList.add("active-card");
    }
  };

  // ** Función para actualizar el fondo dinámico **
  const updateBackground = (card) => {
    const bgImage = card.getAttribute("data-background");
    if (bgImage) {
      background.style.backgroundImage = `url(${bgImage})`;
    }
  };

  // ** Función para actualizar el contenedor de información con transiciones **
  const updateInfoGrid = (card) => {
    infoGrid.classList.remove("active");

    setTimeout(() => {
      const titleImage = card.getAttribute("data-title") || "";
      const age = card.getAttribute("data-edad") || "N/A";
      const year = card.getAttribute("data-año") || "N/A";
      const durationHours = card.getAttribute("data-duracion-horas") || "N/A";
      const durationMinutes = card.getAttribute("data-duracion-minutos") || "N/A";
      const genres = (card.getAttribute("data-genre") || "").split(",").map((g) => g.trim());

      const infoTitleImage = infoGrid.querySelector(".info-title img");
      infoTitleImage.src = titleImage;

      const infoItem = infoGrid.querySelector(".info-item h4");
      infoItem.innerHTML = `
        <span id="edad">${age}</span>
        <span id="año">${year}</span>
        <span id="duracion-horas">${durationHours}</span>
        <span id="duracion-minutos">${durationMinutes}</span>
      `;

      const genreContainer = infoGrid.querySelector(".info-genero");
      genreContainer.innerHTML = ""; // Limpiar géneros previos
      genres.forEach((genre) => {
        const genreElement = document.createElement("div");
        genreElement.classList.add("genre");
        genreElement.textContent = genre;
        genreContainer.appendChild(genreElement);
      });

      infoGrid.classList.add("active");
    }, 300);
  };

  initializeFirstCard(); // Inicializar el primer card al cargar la página

  // ** Eventos para cada card **
  cards.forEach((card) => {
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
      const link = card.querySelector("a");
      if (link) {
        window.location.href = link.href;
      }
    });
  });

  // ** Asegurar visibilidad del card enfocado en el carrusel **
  function ensureCardVisibility(card) {
    const carouselTrack = card.closest(".carousel-track");
    if (!carouselTrack) return;

    const cardRect = card.getBoundingClientRect();
    const trackRect = carouselTrack.getBoundingClientRect();

    if (cardRect.left < trackRect.left) {
      carouselTrack.scrollLeft -= trackRect.left - cardRect.left + 20;
    } else if (cardRect.right > trackRect.right) {
      carouselTrack.scrollLeft += cardRect.right - trackRect.right + 20;
    }
  }

  // ** Navegación dinámica entre carruseles y sidebar **
  carousels.forEach((carousel, index) => {
    const track = carousel.querySelector(".carousel-track");
    const nextButton = carousel.querySelector(".nav-button.next");
    const prevButton = carousel.querySelector(".nav-button.prev");

    if (!track || !nextButton || !prevButton) {
      console.error(`Faltan elementos en el carrusel ${index + 1}.`);
      return;
    }

    nextButton.addEventListener("click", () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      track.scrollLeft = Math.min(track.scrollLeft + cards[0].offsetWidth + 20, maxScroll);
    });

    prevButton.addEventListener("click", () => {
      track.scrollLeft = Math.max(track.scrollLeft - cards[0].offsetWidth - 20, 0);
    });
  

  

    carousel.addEventListener("keydown", (e) => {
      const focusedCard = document.activeElement;

      if (e.key === "ArrowRight" && focusedCard.nextElementSibling) {
        focusedCard.nextElementSibling.focus();
      } else if (e.key === "ArrowLeft") {
        if (focusedCard.previousElementSibling) {
          focusedCard.previousElementSibling.focus();
        } else if (focusedCard === cards[0] && !isReturningToSidebar) {
          isReturningToSidebar = true;
          setTimeout(() => (isReturningToSidebar = false), 200);
        } else if (isReturningToSidebar) {
          const activeMenu = document.querySelector(".menu-item.active");
          if (activeMenu) activeMenu.focus();
        }
      } else if (e.key === "ArrowDown" && carousels[index + 1]) {
        const nextCarouselCards = carousels[index + 1].querySelectorAll(".card");
        if (nextCarouselCards.length) nextCarouselCards[0].focus();
      } else if (e.key === "ArrowUp" && carousels[index - 1]) {
        const prevCarouselCards = carousels[index - 1].querySelectorAll(".card");
        if (prevCarouselCards.length) prevCarouselCards[0].focus();
      }
    });
  });
// ** Eliminar bordes amarillos en Android sin afectar otros estilos **
const style = document.createElement("style");
style.textContent = `
  /* Solo eliminar el borde amarillo predeterminado */
  *:focus {
    outline: none;
  }

  /* Reintroducir bordes personalizados si existen */
  .active-card:focus {
    outline: 2px solid white; /* Ejemplo de borde blanco para cards */
  }

  .nav-button:focus {
    outline: 2px solid white; /* Ejemplo para botones */
  }
`;
document.head.appendChild(style);

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
