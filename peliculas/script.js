// Primera función para el botón compartir con WhatsApp el URL de la app
document.addEventListener("DOMContentLoaded", function () {
    const botonCompartir = document.getElementById("botonCompartir");
    botonCompartir.addEventListener("click", function () {
        const compartirUrl = "https://www.mediafire.com/file/swwocayu38fn0u3/LoShel-v-9-9-1.apk/file";
        const movieTitle = document.getElementById("movie-title-text").innerText;
        const mensaje = `Hola, estoy mirando ${movieTitle}. Tú también lo puedes ver descargando la app LoShel Movie desde aquí: ${compartirUrl}`;

        window.open(`whatsapp://send?text=${encodeURIComponent(mensaje)}`);
    });

    // Obtener el elemento donde se mostrarán las estrellas
    const puntuacionElemento = document.getElementById("puntuacion");

    if (puntuacionElemento) {
        const puntuacionNumerica = parseFloat(puntuacionElemento.dataset.puntuacion);

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

        const estrellasHTML = calcularEstrellas(puntuacionNumerica);
        puntuacionElemento.querySelector(".stars").innerHTML = estrellasHTML;
    }

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
        generoElemento.textContent = nombresGenero.join(" / ");
    }

    const addButton = document.querySelector(".add-button a");

    if (addButton) {
        addButton.addEventListener("click", function (event) {
            event.preventDefault();
            agregarFavorito();
        });
    }

    function agregarFavorito() {
        let idUnico = document.getElementById("ID_pelicula").value;
        let coverUrl = document.getElementById("cover-url").value;
        let coverUrl2 = document.getElementById("cover-url-2").value;
        let paginaNombre = document.getElementById("pagina-nombre").value;

        let favoritos = JSON.parse(localStorage.getItem("favoritos")) || [];

        if (!favoritos.some((movie) => movie.id === idUnico)) {
            favoritos.push({
                id: idUnico,
                coverUrl: coverUrl,
                coverUrl2: coverUrl2,
                paginaNombre: paginaNombre,
            });

            localStorage.setItem("favoritos", JSON.stringify(favoritos));
            alert("Película añadida a favoritos.");
        } else {
            alert("Esta película ya está en tus favoritos.");
        }
    }

    // Navegación con KeyDown
    const botonVideo = document.getElementById("video1");
    const botonVolver = document.getElementById("back-button");
    const navegables = [botonVolver, botonVideo];

    document.addEventListener("keydown", function (e) {
        const currentFocus = document.activeElement;
        const index = navegables.indexOf(currentFocus);

        if (e.key === "ArrowRight") {
            const nextIndex = (index + 1) % navegables.length;
            navegables[nextIndex]?.focus();
        } else if (e.key === "ArrowLeft") {
            const prevIndex = (index - 1 + navegables.length) % navegables.length;
            navegables[prevIndex]?.focus();
        }
    });
});
