document.addEventListener("DOMContentLoaded", function () {
  // Botón Compartir en WhatsApp
  const botonCompartir = document.getElementById("botonCompartir");
  if (botonCompartir) {
      botonCompartir.addEventListener("click", function () {
          const compartirUrl = "https://www.mediafire.com/file/swwocayu38fn0u3/LoShel-v-9-9-1.apk/file";
          const movieTitle = document.getElementById("movie-title-text").innerText;
          const mensaje = `Hola, estoy mirando ${movieTitle}. Tú también lo puedes ver descargando la app LoShel Movie desde aquí: ${compartirUrl}`;
          window.open(`whatsapp://send?text=${encodeURIComponent(mensaje)}`);
      });
  }

  // Mostrar estrellas según puntuación
  const puntuacionElemento = document.getElementById("puntuacion");
  if (puntuacionElemento) {
      const puntuacionNumerica = parseFloat(puntuacionElemento.dataset.puntuacion);
      const estrellasHTML = calcularEstrellas(puntuacionNumerica);
      puntuacionElemento.querySelector(".stars").innerHTML = estrellasHTML;
  }

  function calcularEstrellas(puntuacion) {
      const MAX_ESTRELLAS = 5;
      const puntuacionRedondeada = Math.round(puntuacion * 2) / 2;
      const estrellasEnteras = Math.floor(puntuacionRedondeada);
      const estrellaMitad = puntuacionRedondeada % 1 !== 0;
      let starsHTML = "";

      for (let i = 0; i < estrellasEnteras; i++) {
          starsHTML += '<ion-icon name="star"></ion-icon>';
      }
      if (estrellaMitad) {
          starsHTML += '<ion-icon name="star-half"></ion-icon>';
      }
      const estrellasRestantes = MAX_ESTRELLAS - estrellasEnteras - (estrellaMitad ? 1 : 0);
      for (let i = 0; i < estrellasRestantes; i++) {
          starsHTML += '<ion-icon name="star-outline"></ion-icon>';
      }
      return starsHTML;
  }

  // Mostrar géneros con estilo
  const generos = {
      1: "Acción",
      2: "Aventura",
      3: "Comedia",
      4: "Drama",
      5: "Suspenso",
      6: "Ciencia Ficción",
      7: "Animación",
      8: "Fantasía",
      9: "Terror",
      10: "Bélico",
      11: "Romance",
      12: "Crimen",
      13: "Documental",
      14: "Superhéroes",
      15: "Infantil",
  };
  const generoElemento = document.getElementById("genero");
  if (generoElemento) {
      const idsGenero = generoElemento.dataset.genreIds.split(",").map((id) => parseInt(id.trim()));
      const nombresGenero = idsGenero.map((id) => generos[id]);
      generoElemento.innerHTML = nombresGenero.map((nombre) => `<span class="genre">${nombre}</span>`).join(" ");
  }
// Efecto de entrada para el contenido
const movieContent = document.getElementById("movie-content");
if (movieContent) {
    setTimeout(() => {
        movieContent.classList.add("visible");
    }, 200);
}
  
    // KeyDown Navigation
   // -------- Navegación por teclado y control remoto --------
  // Recogemos todos los elementos enfocables
  const focusable = Array.from(document.querySelectorAll('a, button'));

  // Añadimos tabindex a todos si no lo tienen
  focusable.forEach(el => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  });

  // Enfoque inicial: botón "Ver Ahora"
  const playButton = document.querySelector('.movie-buttons a');
  if (playButton) playButton.focus();

  // Manejo de flechas y Enter
  document.addEventListener('keydown', function (e) {
    const current = document.activeElement;
    const idx = focusable.indexOf(current);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusable[(idx + 1) % focusable.length].focus();
    }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusable[(idx - 1 + focusable.length) % focusable.length].focus();
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      current.click();
    }
  });

    // Eliminar bordes de enfoque predeterminados
    document.querySelectorAll("button, a").forEach((element) => {
        element.style.outline = "none";
    });
});



