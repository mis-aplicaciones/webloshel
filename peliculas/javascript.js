// Primera funcion para el boton compartir con whasapp el url de la app
document.addEventListener("DOMContentLoaded", function () {
    const botonCompartir = document.getElementById("botonCompartir");
    botonCompartir.addEventListener("click", function () {
      const compartirUrl = "https://www.mediafire.com/file/uk7icwe9mfbu4le/LoShel-v.9.9.apk/file"; // Reemplaza esto con la URL de tu página
      const movieTitle = document.getElementById("movie-title-text").innerText;
      const mensaje = `Hola, estoy mirando ${movieTitle}. Tú también lo puedes ver descargando la app LoShel Movie desde aquí: ${compartirUrl}`;
  
      window.open(`whatsapp://send?text=${encodeURIComponent(mensaje)}`);
    });
  
    // Obtener el elemento donde se mostrarán las estrellas
    const puntuacionElemento = document.getElementById("puntuacion");
  
    if (puntuacionElemento) {
      // Obtener la puntuación numérica del atributo de datos
      const puntuacionNumerica = parseFloat(puntuacionElemento.dataset.puntuacion);
  
      // Función para convertir la puntuación numérica a estrellas
      function calcularEstrellas(puntuacion) {
        const MAX_ESTRELLAS = 5; // Máximo de estrellas permitidas
        const puntuacionRedondeada = Math.round(puntuacion * 2) / 2; // Redondear la puntuación a la mitad más cercana
        const estrellasEnteras = Math.floor(puntuacionRedondeada); // Obtener la cantidad de estrellas enteras
        const estrellaMitad = puntuacionRedondeada % 1 !== 0; // Verificar si hay una estrella mitad
  
        let starsHTML = ""; // String para almacenar las etiquetas HTML de las estrellas
  
        // Agregar estrellas enteras
        for (let i = 0; i < estrellasEnteras; i++) {
          starsHTML += '<ion-icon name="star"></ion-icon>';
        }
  
        // Agregar estrella mitad si corresponde
        if (estrellaMitad) {
          starsHTML += '<ion-icon name="star-half"></ion-icon>';
        }
  
        // Completar con estrellas vacías si no se alcanzó el máximo
        const estrellasRestantes = MAX_ESTRELLAS - estrellasEnteras - (estrellaMitad ? 1 : 0);
        for (let i = 0; i < estrellasRestantes; i++) {
          starsHTML += '<ion-icon name="star-outline"></ion-icon>';
        }
  
        return starsHTML; // Retornar el HTML de las estrellas
      }
  
      // Calcular las estrellas según la puntuación
      const estrellasHTML = calcularEstrellas(puntuacionNumerica);
  
      // Mostrar las estrellas en el elemento correspondiente
      puntuacionElemento.querySelector(".stars").innerHTML = estrellasHTML;
    }
  
    // Mapeo de IDs de género a nombres de género
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
  
    // Obtener el elemento de género
    const generoElemento = document.getElementById("genero");
  
    if (generoElemento) {
      // Obtener los IDs de género del atributo de datos
      const idsGenero = generoElemento.dataset.genreIds.split(",").map((id) => parseInt(id.trim()));
  
      // Obtener los nombres de género correspondientes a los IDs
      const nombresGenero = idsGenero.map((id) => generos[id]);
  
      // Mostrar los nombres de género separados por " / "
      generoElemento.textContent = nombresGenero.join(" / ");
    }
  
    // Buscamos el botón de añadir por su clase
    const addButton = document.querySelector(".add-button a");
  
    if (addButton) {
      // Agregamos un evento de clic al botón
      addButton.addEventListener("click", function (event) {
        // Evitamos el comportamiento predeterminado del enlace
        event.preventDefault();
  
        // Llamamos a la función agregarFavorito
        agregarFavorito();
      });
    }
  
    function agregarFavorito() {
      // Obtenemos el ID único de la película desde el valor del input hidden
      let idUnico = document.getElementById("ID_pelicula").value;
  
      // Obtenemos el URL del cover desde el valor del input hidden
      let coverUrl = document.getElementById("cover-url").value;
      // Obtenemos el URL del cover desde el valor del input hidden
      let coverUrl2 = document.getElementById("cover-url-2").value;
  
      // Obtenemos el nombre de la página desde el valor del input hidden
      let paginaNombre = document.getElementById("pagina-nombre").value;
  
      // Obtenemos la lista de favoritos almacenada en el almacenamiento local
      let favoritos = JSON.parse(localStorage.getItem("favoritos")) || [];
  
      // Verificamos si la película ya está en la lista de favoritos
      if (!favoritos.some((movie) => movie.id === idUnico)) {
        // Si no está en la lista, la agregamos
        favoritos.push({
          id: idUnico,
          coverUrl: coverUrl,
          coverUrl2: coverUrl2,
          paginaNombre: paginaNombre,
        });
  
        // Actualizamos la lista de favoritos en el almacenamiento local
        localStorage.setItem("favoritos", JSON.stringify(favoritos));
  
        // Notificamos al usuario que la película se agregó a favoritos (opcional)
        alert("Película añadida a favoritos.");
  
        // Registro en la consola
        console.log("Película agregada a favoritos:", {
          id: idUnico,
          coverUrl: coverUrl,
          coverUrl2: coverUrl2,
          paginaNombre: paginaNombre,
        });
      } else {
        // Si la película ya está en la lista, mostramos un mensaje de alerta (opcional)
        alert("Esta película ya está en tus favoritos.");
  
        // Registro en la consola
        console.log(
          "Intento de agregar una película que ya está en favoritos:",
          { id: idUnico }
        );
      }
    }
  
    const menuToggle = document.getElementById("menu-toggle");
    const bottomMenu = document.getElementById("bottom-menu");
    const movieContent = document.getElementById("movie-content");
  
    // Función para cambiar la visibilidad del menú inferior
    function toggleBottomMenu() {
      const currentIcon = menuToggle
        .querySelector("ion-icon")
        .getAttribute("name");
      const menuIcon = "menu";
      const closeIcon = "close-circle";
      const newIcon = currentIcon === menuIcon ? closeIcon : menuIcon;
  
      // Cambia el icono del botón
      menuToggle.querySelector("ion-icon").setAttribute("name", newIcon);
  
      // Verifica si el elemento bottomMenu existe
      if (bottomMenu) {
        if (newIcon === closeIcon) {
          bottomMenu.style.display = "flex";
          localStorage.setItem("bottomMenuVisible", "true");
  
          // Cambia los estilos de movieContent cuando el menú inferior está activo
          movieContent.style.bottom = "60px"; // Aumentamos el espacio inferior del contenido
        } else {
          bottomMenu.style.display = "none";
          localStorage.setItem("bottomMenuVisible", "false");
  
          // Restaura los estilos cuando el menú inferior está desactivado
          movieContent.style.bottom = "10px";
        }
      }
    }
  
    // Agrega el evento click al botón de menú
    if (menuToggle) {
      menuToggle.addEventListener("click", toggleBottomMenu);
    }
  
    // Verifica si hay un estado guardado para el menú inferior al cargar la página
    const bottomMenuVisible = localStorage.getItem("bottomMenuVisible");
    if (bottomMenuVisible === "true" && bottomMenu) {
      bottomMenu.style.display = "flex"; // Muestra el menú si estaba activo
      menuToggle
        .querySelector("ion-icon")
        .setAttribute("name", "close-circle");
      movieContent.style.bottom = "60px";
    }
  });
  