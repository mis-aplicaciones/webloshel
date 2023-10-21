const fila = document.querySelector('.contenedor-carousel');
const peliculas = document.querySelectorAll('.pelicula');

const flechaIzquierda = document.getElementById('flecha-izquierda');
const flechaDerecha = document.getElementById('flecha-derecha');

flechaDerecha.addEventListener('click', ()=>{
    fila.scrollLeft += fila.offsetwidth;
});

flechaIzquierda.addEventListener('click', ()=>{
    fila.scrollLeft -= fila.offsetwidth;
});

const numeroPaginas = peliculas.length / 5