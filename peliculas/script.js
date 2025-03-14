document.addEventListener("DOMContentLoaded", function () {
  // Botón Compartir en WhatsApp
  const botonCompartir = document.getElementById("botonCompartir");
  if (botonCompartir) {
      botonCompartir.addEventListener("click", function () {
          const compartirUrl = "https://www.mediafire.com/file/ax1zxvdcf3xcaez/LoShel-v-9-9-9.apk/file";
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
    const botonVolver = document.getElementById("back-button");
    const botonVerAhora = document.querySelector(".movie-buttons a");
    const navegables = [botonVolver, botonVerAhora];

    document.addEventListener("keydown", function (e) {
        const currentFocus = document.activeElement;
        const index = navegables.indexOf(currentFocus);

        if (e.key === "ArrowRight") {
            const nextIndex = (index + 1) % navegables.length;
            navegables[nextIndex]?.focus();
        } else if (e.key === "ArrowLeft") {
            const prevIndex = (index - 1 + navegables.length) % navegables.length;
            navegables[prevIndex]?.focus();
        } else if (e.key === "Enter") {
            currentFocus.click();
        } else if (e.key === "Backspace" || e.key === "Escape") {
            e.preventDefault();
            botonVolver.focus();
        }
    });

    // Eliminar bordes de enfoque predeterminados
    document.querySelectorAll("button, a").forEach((element) => {
        element.style.outline = "none";
    });
});



