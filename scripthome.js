// scripthome.js

let data = null;
let defs = null;
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;

// Calcula estrellas para el rating
function calcularEstrellas(p) {
  const MAX = 5;
  const r = Math.round(p * 2) / 2;
  const full = Math.floor(r), half = r % 1 !== 0;
  let html = "";
  for (let i = 0; i < full; i++) html += '<ion-icon name="star"></ion-icon>';
  if (half) html += '<ion-icon name="star-half"></ion-icon>';
  for (let i = 0; i < MAX - full - (half ? 1 : 0); i++)
    html += '<ion-icon name="star-outline"></ion-icon>';
  return html;
}

// Actualiza detalles sin animación
function updateDetails(item) {
  const bg    = document.getElementById("background");
  const img   = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta  = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  bg.style.backgroundImage = `url('${item.backgroundUrl}')`;
  img.src = item.titleimgUrl;
  title.textContent = item.title;

  meta.innerHTML =
    `<span>${item.edad}</span> • ` +
    `<span>${item.hora}h ${item.min}min</span> • ` +
    `<span>${item.año}</span> • ` +
    `<span>${calcularEstrellas(item.rating)}</span>`;

  genEl.innerHTML = "";
  (item.genero || []).forEach(g => {
    const s = document.createElement("span");
    s.textContent = g;
    genEl.appendChild(s);
  });
}

// Construye carrusel
function initCarousel() {
  const carousel = document.getElementById("carousel");
  carousel.innerHTML = "";
  let firstCard = null;

  defs.forEach((def, rowIdx) => {
    let items = [];
    if (def.type === "field") {
      items = data.filter(item => {
        const v = item[def.field];
        return Array.isArray(v)
          ? v.some(x => def.values.includes(x))
          : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = data.filter(item => item.rating >= def.minRating);
    } else {
      items = data.filter(item => def.ids.includes(item.id));
    }
    if (!items.length) return;

    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name;

    const cont = document.createElement("div");
    cont.className = "cards-container";

    items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl}')`;

      card.addEventListener("focus", () => {
        lastFocus = { row: rowIdx, card: idx };
        focusCard(item);
      });

      card.addEventListener("click", () => {
        window.location.href = item.link;
      });

      card.addEventListener("keydown", e => {
        if (e.key === "Enter") window.location.href = item.link;
      });

      cont.appendChild(card);
      if (!firstCard) firstCard = card;
    });

    row.append(title, cont);
    carousel.appendChild(row);
  });

  return firstCard;
}

// Restaura foco y vista
function restoreFocus() {
  // --- MODIFICACIÓN IMPORTANTE ---
  // Reinicia el scroll horizontal de TODAS las filas para evitar el desfase.
  document.querySelectorAll(".cards-container").forEach(container => {
    container.scrollLeft = 0;
  });
  // --- FIN DE LA MODIFICACIÓN ---

  const rows = document.querySelectorAll("#carousel .row");
  const rowEl = rows[lastFocus.row];
  if (!rowEl) return;
  
  rowEl.scrollIntoView({ behavior: "smooth", block: "start" });
  
  const card = rowEl.querySelectorAll(".card")[lastFocus.card];
  if (card) {
    card.focus();
    // actualiza detalles para ese ítem
    const def = defs[lastFocus.row];
    let items = [];
    if (def.type === "field") {
      items = data.filter(i => {
        const v = i[def.field];
        return Array.isArray(v)
          ? v.some(x => def.values.includes(x))
          : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = data.filter(i => i.rating >= def.minRating);
    } else {
      items = data.filter(i => def.ids.includes(i.id));
    }
    updateDetails(items[lastFocus.card]);
  }
}

// Actualiza con animación
function focusCard(item) {
  if (isAnimating) {
    updateDetails(item);
    return;
  }
  isAnimating = true;

  const bg    = document.getElementById("background");
  const detail= document.getElementById("detail");
  const img   = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta  = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  [bg, detail, img, title, meta, genEl].forEach(el => {
    el.classList.remove("fade-in");
    el.classList.add("fade-out");
  });

  const onEnd = e => {
    if (e.propertyName !== "opacity") return;
    bg.removeEventListener("transitionend", onEnd);
    updateDetails(item);
    [bg, detail, img, title, meta, genEl].forEach(el => {
      el.classList.remove("fade-out");
      el.classList.add("fade-in");
    });
    setTimeout(() => { isAnimating = false; }, 300);
  };

  bg.addEventListener("transitionend", onEnd, { once: true });
}

// ------- Listeners de teclado -------
document.body.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  
  if (["Backspace", "Escape"].includes(e.key)) {
    window.dispatchEvent(new Event("return-to-sidebar"));
    e.preventDefault();
    return;
  }
  if (!active.classList.contains("card")) return;

  const row = active.closest(".row");
  const cards = Array.from(row.querySelectorAll(".card"));
  const idx = cards.indexOf(active);
  let target;

  switch (e.key) {
    case "ArrowRight":
      if (idx < cards.length - 1) {
        target = cards[idx + 1];
        target.focus();
      }
      break;

    case "ArrowLeft":
      if (idx === 0) {
        window.dispatchEvent(new Event("return-to-sidebar"));
        e.preventDefault();
        return;
      }
      if (idx > 0) {
        target = cards[idx - 1];
        target.focus();
      }
      break;

    case "ArrowDown": {
      const nr = row.nextElementSibling;
      if (nr) {
        target = nr.querySelectorAll(".card")[idx] || nr.querySelector(".card");
        target.focus();
        nr.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      break;
    }

    case "ArrowUp": {
      const pr = row.previousElementSibling;
      if (pr) {
        target = pr.querySelectorAll(".card")[idx] || pr.querySelector(".card");
        target.focus();
        pr.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      break;
    }
  }

  // Ahora el scrollIntoView se maneja con el foco en la tarjeta gracias al CSS
  if (["ArrowRight", "ArrowLeft"].includes(e.key) && document.activeElement.classList.contains('card')) {
       document.activeElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
  }
});


// --- Función SPA: inicializa Home ---
function initializeHome() {
  const execute = () => {
    const car = document.getElementById("carousel");
    try {
      defs = JSON.parse(localStorage.getItem("carouselDefs")||"[]");
      if (!Array.isArray(defs)) defs = [];
    } catch {
      defs = [];
    }
    if (!defs.length) {
      defs = [
        { name:"Estrenos 2025", type:"field",   field:"año",     values:["2025"] },
        { name:"Acción",        type:"field",   field:"genero",  values:["Acción"] },
        { name:"Top Valoradas", type:"rating",  minRating:3.5 }
      ];
    }
    if (!data) {
      fetch("moviebase.json")
        .then(r=>{ if(!r.ok) throw Error(); return r.json(); })
        .then(json=>{
          data = json;
          const first = initCarousel();
          if (first) { 
            first.focus(); 
            lastFocus={row:0,card:0}; 
            focusCard(data.find(item => item.id === 1) || json[0]); // Intenta buscar el primer item real
          }
        })
        .catch(_=>{
          car.innerHTML = '<div style="color:red;padding:2rem;">Error al cargar los datos.</div>';
        });
    } else {
      if(!car.children.length) initCarousel();
      restoreFocus();
    }
  };
  const poll = setInterval(()=>{
    if (document.getElementById("carousel")) {
      clearInterval(poll);
      execute();
    }
  },100);
}

window.initializeHome = initializeHome;
