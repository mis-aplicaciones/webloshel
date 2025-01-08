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

  // ** Inicializar el primer card **
  const initializeFirstCard = () => {
    const firstCard = cards[0];
    if (firstCard) {
      firstCard.focus();
      updateBackground(firstCard); // Actualizar fondo
      updateInfoGrid(firstCard); // Actualizar info-grid
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

  // ** Función para actualizar el contenedor de información **
  const updateInfoGrid = (card) => {
    const titleImage = card.getAttribute("data-title") || "";
    const age = card.getAttribute("data-edad") || "N/A";
    const year = card.getAttribute("data-año") || "N/A";
    const durationHours = card.getAttribute("data-duracion-horas") || "N/A";
    const durationMinutes = card.getAttribute("data-duracion-minutos") || "N/A";
    const genres = (card.getAttribute("data-genre") || "").split(",").map((g) => g.trim());

    // Actualizar imagen del título
    const infoTitleImage = infoGrid.querySelector(".info-title img");
    infoTitleImage.src = titleImage;

    // Actualizar detalles de edad, año y duración
    const infoItem = infoGrid.querySelector(".info-item h4");
    infoItem.innerHTML = `
      <span id="edad">${age}</span>
      <span id="año">${year}</span>
      <span id="duracion-horas">${durationHours}</span>
      <span id="duracion-minutos">${durationMinutes}</span>
    `;

    // Actualizar géneros
    const genreContainer = infoGrid.querySelector(".info-genero");
    genreContainer.innerHTML = ""; // Limpiar géneros previos
    genres.forEach((genre) => {
      const genreElement = document.createElement("div");
      genreElement.classList.add("genre");
      genreElement.textContent = genre;
      genreContainer.appendChild(genreElement);
    });
  };

  initializeFirstCard(); // Inicializar primer card al cargar la página

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

    // Abrir enlace con Enter
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const link = card.querySelector("a");
        if (link) {
          e.preventDefault();
          window.location.href = link.href;
        }
      }
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
    const cards = carousel.querySelectorAll(".card");
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

  console.log("Home inicializado correctamente");
}
