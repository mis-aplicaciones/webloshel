// scripthome.js (actualizado)
// Mantener la API: window.initializeHome()

let data = null;
let defs = null;
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;

// Calcula estrellas para el rating
function calcularEstrellas(p) {
  const MAX = 5;
  const r = Math.round((p || 0) * 2) / 2;
  const full = Math.floor(r), half = r % 1 !== 0;
  let html = "";
  for (let i = 0; i < full; i++) html += '<ion-icon name="star"></ion-icon>';
  if (half) html += '<ion-icon name="star-half"></ion-icon>';
  for (let i = 0; i < MAX - full - (half ? 1 : 0); i++)
    html += '<ion-icon name="star-outline"></ion-icon>';
  return html;
}

// Update details immediately (no animation)
function updateDetails(item) {
  const bg    = document.getElementById("background");
  const img   = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta  = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  if (bg) bg.style.backgroundImage = `url('${item.backgroundUrl}')`;
  if (img) img.src = item.titleimgUrl || "";
  if (title) title.textContent = item.title || "";

  if (meta) {
    meta.innerHTML =
      `<span>${item.edad || ""}</span> • ` +
      `<span>${item.hora || ""}h ${item.min || ""}min</span> • ` +
      `<span>${item.año || ""}</span> • ` +
      `<span>${calcularEstrellas(item.rating)}</span>`;
  }

  if (genEl) {
    genEl.innerHTML = "";
    (item.genero || []).forEach(g => {
      const s = document.createElement("span");
      s.textContent = g;
      genEl.appendChild(s);
    });
  }
}

// Centra un card dentro de su fila (solo horizontal) — no toca otras filas
function ensureCardVisibility(card) {
  if (!card) return;
  const container = card.closest(".cards-container");
  if (!container) return;

  // Asegurarnos que el contenedor tenga overflow-x (si no lo tiene, asignamos)
  // (Esto no modifica markup permanente del prototipo, solo para seguridad)
  if (getComputedStyle(container).overflowX === "visible") {
    container.style.overflowX = "auto";
  }

  // Calculamos scrollLeft necesario para centrar el card en el contenedor
  const cardOffsetLeft = card.offsetLeft;
  const cardWidth = card.offsetWidth;
  const containerWidth = container.clientWidth;

  const targetScrollLeft = cardOffsetLeft - (containerWidth / 2) + (cardWidth / 2);

  container.scrollTo({
    left: targetScrollLeft,
    behavior: "smooth"
  });
}

// Construye el carrusel según defs y devuelve el primer card creado
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
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
    } else { // collection
      items = data.filter(item => def.ids.includes(item.id));
    }
    if (!items.length) return;

    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";
    // make horizontal scrollable if it overflows
    cont.style.overflowX = "auto";
    cont.style.whiteSpace = "nowrap";

    items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl}')`;

      // Focus: guardamos posición y actualizamos detalles
      card.addEventListener("focus", () => {
        lastFocus = { row: rowIdx, card: idx };
        // Centramos SOLO esa fila horizontalmente
        ensureCardVisibility(card);
        focusCard(item);
      });

      // Click / Enter -> abrir link
      card.addEventListener("click", () => {
        if (item.link) window.location.href = item.link;
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          if (item.link) window.location.href = item.link;
        }
      });

      cont.appendChild(card);
      if (!firstCard) firstCard = card;
    });

    row.append(title, cont);
    carousel.appendChild(row);
  });

  return firstCard;
}

// Restaurar foco a la última posición guardada (y posicionar fila correctamente)
function restoreFocus() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;
  const rows = carousel.querySelectorAll(".row");
  const rowEl = rows[lastFocus.row];
  if (!rowEl) return;

  // Primero aseguramos que la fila esté visible verticalmente (titulo a la vista)
  rowEl.scrollIntoView({ behavior: "smooth", block: "start" });

  // Luego enfocamos el card y centramos horizontalmente dentro de su fila
  const cards = rowEl.querySelectorAll(".card");
  const card = cards[lastFocus.card];
  if (card) {
    // small timeout para que el scroll vertical haya ocurrido antes de centrar
    setTimeout(() => {
      card.focus();
      ensureCardVisibility(card);

      // Actualizar detalles con el ítem correspondiente
      const def = defs[lastFocus.row];
      let items = [];
      if (def.type === "field") {
        items = data.filter(i => {
          const v = i[def.field];
          return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
        });
      } else if (def.type === "rating") {
        items = data.filter(i => i.rating >= def.minRating);
      } else {
        items = data.filter(i => def.ids.includes(i.id));
      }
      updateDetails(items[lastFocus.card] || items[0] || {});
    }, 160);
  }
}

// Actualiza con animación; si ya está animando, hace update directo
function focusCard(item) {
  if (!item) return;
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
    if (el) {
      el.classList.remove("fade-in");
      el.classList.add("fade-out");
    }
  });

  const onEnd = (e) => {
    if (e.propertyName !== "opacity") return;
    if (bg) bg.removeEventListener("transitionend", onEnd);
    updateDetails(item);
    [bg, detail, img, title, meta, genEl].forEach(el => {
      if (el) {
        el.classList.remove("fade-out");
        el.classList.add("fade-in");
      }
    });
    // pequeño retraso para evitar rapid-fire
    setTimeout(() => { isAnimating = false; }, 300);
  };

  if (bg) {
    bg.addEventListener("transitionend", onEnd, { once: true });
    // for browsers that may not trigger transitionend (defensive)
    // fallback: if opacity transition time is 0, call onEnd immediately
    const style = getComputedStyle(bg);
    const dur = parseFloat(style.transitionDuration || 0);
    if (!dur) onEnd({ propertyName: "opacity" });
    // start fade by toggling classes
    bg.classList.remove("fade-in");
    bg.classList.add("fade-out");
    detail.classList.remove("fade-in");
    detail.classList.add("fade-out");
  } else {
    // if no bg element, update directly
    updateDetails(item);
    setTimeout(() => { isAnimating = false; }, 60);
  }
}

// ------- Listeners de teclado (tu bloque que funciona, extendido) -------
document.body.addEventListener("keydown", (e) => {
  const active = document.activeElement;

  // Back / Escape -> siempre volver al sidebar
  if (["Backspace", "Escape"].includes(e.key)) {
    window.dispatchEvent(new Event("return-to-sidebar"));
    e.preventDefault();
    return;
  }

  if (!active || !active.classList.contains("card")) return;

  const row = active.closest(".row");
  if (!row) return;
  const cards = Array.from(row.querySelectorAll(".card"));
  const idx = cards.indexOf(active);
  let target;

  switch (e.key) {
    case "ArrowRight":
      if (idx < cards.length - 1) {
        target = cards[idx + 1];
        target.focus();
        // Solo centrar horizontalmente en su fila (sin afectar otras filas)
        ensureCardVisibility(target);
      }
      break;

    case "ArrowLeft":
      if (idx === 0) {
        // Si estamos en el primer card de la fila, saltamos al sidebar
        window.dispatchEvent(new Event("return-to-sidebar"));
        e.preventDefault();
        return;
      }
      if (idx > 0) {
        target = cards[idx - 1];
        target.focus();
        ensureCardVisibility(target);
      }
      break;

    case "ArrowDown": {
      const nr = row.nextElementSibling;
      if (nr) {
        target = nr.querySelector(".card");
        // Posicionar la fila objetivo en la zona de interacción (ver título)
        nr.scrollIntoView({ behavior: "smooth", block: "start" });
        // después de que la fila suba, enfocamos y centramos su card
        setTimeout(() => {
          if (target) {
            target.focus();
            ensureCardVisibility(target);
          }
        }, 180);
      }
      break;
    }

    case "ArrowUp": {
      const pr = row.previousElementSibling;
      if (pr) {
        target = pr.querySelector(".card");
        pr.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => {
          if (target) {
            target.focus();
            ensureCardVisibility(target);
          }
        }, 180);
      }
      break;
    }

    default:
      return;
  }

  if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
  }
});

// Función SPA: inicializa Home
function initializeHome() {
  try {
    defs = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
    if (!Array.isArray(defs)) defs = [];
  } catch {
    defs = [];
  }

  const car = document.getElementById("carousel");
  if (!car) {
    console.error("No encontré #carousel");
    return;
  }

  if (!data) {
    fetch("moviebase.json")
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(json => {
        data = json;
        const first = initCarousel();
        if (first) {
          // Aseguramos que la primera fila esté visible y su título también
          const firstRow = first.closest(".row");
          if (firstRow) firstRow.scrollIntoView({ behavior: "auto", block: "start" });
          // small delay then focus and center
          setTimeout(() => {
            first.focus();
            ensureCardVisibility(first);
            lastFocus = { row: 0, card: 0 };
            // cargar detalles para primer ítem disponible (defs[0] primero)
            // buscamos el primer ítem real para detalle
            const def0 = defs[0];
            let firstItem = data[0];
            if (def0) {
              if (def0.type === "field") {
                const found = data.find(i => {
                  const v = i[def0.field];
                  return Array.isArray(v) ? v.some(x => def0.values.includes(x)) : def0.values.includes(v);
                });
                if (found) firstItem = found;
              } else if (def0.type === "rating") {
                firstItem = data.find(i => i.rating >= def0.minRating) || firstItem;
              } else if (def0.type === "collection") {
                firstItem = data.find(i => def0.ids.includes(i.id)) || firstItem;
              }
            }
            focusCard(firstItem || data[0]);
          }, 80);
        }
      })
      .catch(err => {
        console.error("Error loading JSON", err);
        car.innerHTML =
          '<div style="color:red;padding:2rem;">Error loading data</div>';
      });
  } else {
    // Si ya se cargó data antes: reconstruir carrusel o restaurar
    if (!car.children.length) {
      initCarousel();
      // focus en el último guardado
      setTimeout(() => restoreFocus(), 100);
    } else {
      // carrusel presente: restaurar foco
      restoreFocus();
    }
  }
}

// Exponer initializeHome para script.js
window.initializeHome = initializeHome;
