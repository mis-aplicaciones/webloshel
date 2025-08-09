// scripthome.js
// Estado global único (evita redeclaraciones al re-insertar script)
window.homeState = window.homeState || {
  data: null,
  defs: null,
  lastFocus: { row: 0, card: 0 },
  isAnimating: false,
  keyListenerAttached: false
};

const homeState = window.homeState;

// helper: estrellas (mantengo tu lógica)
function calcularEstrellas(p) {
  const MAX = 5;
  const r = Math.round(p * 2) / 2;
  const full = Math.floor(r);
  const half = r % 1 !== 0;
  let html = "";
  for (let i = 0; i < full; i++) html += '<ion-icon name="star"></ion-icon>';
  if (half) html += '<ion-icon name="star-half"></ion-icon>';
  for (let i = 0; i < MAX - full - (half ? 1 : 0); i++)
    html += '<ion-icon name="star-outline"></ion-icon>';
  return html;
}

// Actualiza detalles sin animación (uso también como helper)
function updateDetails(item) {
  if (!item) return;
  const bg = document.getElementById("background");
  const img = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  if (bg) bg.style.backgroundImage = `url('${item.backgroundUrl}')`;
  if (img) img.src = item.titleimgUrl || "";
  if (title) title.textContent = item.title || "";

  if (meta) {
    meta.innerHTML =
      `<span>${item.edad || ""}</span> • ` +
      `<span>${item.hora || ""}h ${item.min || ""}min</span> • ` +
      `<span>${item.año || ""}</span> • ` +
      `<span>${calcularEstrellas(item.rating || 0)}</span>`;
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

// Animación de transición de detalle (con fallback timeout)
function focusCard(item) {
  if (!item) return;
  if (homeState.isAnimating) {
    // si ya animando, actualizar directamente para evitar flickers
    updateDetails(item);
    return;
  }
  homeState.isAnimating = true;

  const bg = document.getElementById("background");
  const detail = document.getElementById("detail");
  const img = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  const elems = [bg, detail, img, title, meta, genEl].filter(Boolean);
  elems.forEach(el => {
    el.classList.remove("fade-in");
    el.classList.add("fade-out");
  });

  // Handler de transitionend (fallback con timeout)
  let doneCalled = false;
  const onEnd = (e) => {
    // filtramos por opacity para mayor seguridad
    if (e && e.propertyName && e.propertyName !== "opacity") return;
    if (doneCalled) return;
    doneCalled = true;
    elems.forEach(el => el.removeEventListener("transitionend", onEnd));
    updateDetails(item);
    elems.forEach(el => {
      el.classList.remove("fade-out");
      el.classList.add("fade-in");
    });
    // dejamos un tiempo para la fade-in y luego desbloqueamos
    setTimeout(() => { homeState.isAnimating = false; }, 300);
  };

  // si background existe la escuchamos; si no, fallback
  if (bg) {
    bg.addEventListener("transitionend", onEnd, { once: true });
    // Safety fallback: algunos webviews no emiten transitionend
    setTimeout(onEnd, 600);
  } else {
    // sin background -> solo actualizamos
    onEnd();
  }
}

// Construye el carrusel y retorna el primer card (DOM element)
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
  carousel.innerHTML = "";
  let firstCard = null;

  const defs = homeState.defs || [];
  const data = homeState.data || [];

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
    } else if (def.type === "collection") {
      items = data.filter(item => def.ids.includes(item.id));
    }

    if (!items.length) return;

    const row = document.createElement("div");
    row.className = "row";
    // permitimos overflow visible para que zoom no se corte
    row.style.overflow = "visible";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";

    items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl || ""}')`;
      card.dataset.link = item.link || "";

      // Focus: guardamos posición y actualizamos detalle
      card.addEventListener("focus", () => {
        homeState.lastFocus = { row: rowIdx, card: idx };
        focusCard(item);
      });

      // click / enter para abrir link
      card.addEventListener("click", () => {
        if (item.link) window.location.href = item.link;
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && item.link) {
          window.location.href = item.link;
        }
      });

      cont.appendChild(card);
      if (!firstCard) firstCard = card;
    });

    row.appendChild(title);
    row.appendChild(cont);
    carousel.appendChild(row);
  });

  return firstCard;
}

// Restaura foco guardado (protecciones y clamp)
function restoreFocus() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;
  const rows = carousel.querySelectorAll(".row");
  if (!rows.length) return;

  // Clamp row index
  let r = Math.max(0, Math.min(homeState.lastFocus.row, rows.length - 1));
  const rowEl = rows[r];
  const cards = rowEl.querySelectorAll(".card");
  if (!cards.length) {
    // si fila vacía, fall back al primer card de la primera fila
    const firstRow = rows[0];
    const firstCard = firstRow && firstRow.querySelector(".card");
    if (firstCard) firstCard.focus();
    return;
  }

  // Clamp card index
  let c = Math.max(0, Math.min(homeState.lastFocus.card, cards.length - 1));
  const card = cards[c];
  if (card) {
    // aseguramos que la fila esté visible (sube a zona activa)
    rowEl.scrollIntoView({ behavior: "smooth", block: "start" });
    card.focus();

    // también actualizamos detalles con el item correspondiente
    // reconstruimos items de la fila para elegir el item real
    const def = (homeState.defs || [])[r];
    let items = [];
    if (!def) return;
    if (def.type === "field") {
      items = (homeState.data || []).filter(i => {
        const v = i[def.field];
        return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = (homeState.data || []).filter(i => i.rating >= def.minRating);
    } else {
      items = (homeState.data || []).filter(i => def.ids.includes(i.id));
    }
    const item = items[Math.min(c, items.length - 1)];
    if (item) updateDetails(item);
  }
}

// Key navigation (útil que el usuario pidió mantener exactamente)
function attachKeyNav() {
  if (homeState.keyListenerAttached) return;
  const keyHandler = (e) => {
    const active = document.activeElement;

    // botón volver -> regresar al sidebar
    if (["Backspace", "Escape"].includes(e.key)) {
      window.dispatchEvent(new Event("return-to-sidebar"));
      return;
    }

    if (!active || !active.classList || !active.classList.contains("card")) return;

    const row = active.closest(".row");
    if (!row) return;
    const cards = Array.from(row.querySelectorAll(".card"));
    const idx = cards.indexOf(active);
    let target = null;

    switch (e.key) {
      case "ArrowRight":
        if (idx < cards.length - 1) target = cards[idx + 1];
        break;
      case "ArrowLeft":
        // si estamos en primer card de la fila -> saltar al sidebar (comportamiento que pediste)
        if (idx === 0) {
          // dispatch evento para que sidebar retome control
          window.dispatchEvent(new Event("return-to-sidebar"));
          e.preventDefault();
          return;
        }
        if (idx > 0) target = cards[idx - 1];
        break;
      case "ArrowDown": {
        const nr = row.nextElementSibling;
        if (nr) target = nr.querySelector(".card");
        break;
      }
      case "ArrowUp": {
        const pr = row.previousElementSibling;
        if (pr) target = pr.querySelector(".card");
        break;
      }
      case "Enter":
        // abrir link si existe
        const link = active.dataset.link;
        if (link) window.location.href = link;
        return;
      default:
        return;
    }

    if (target) {
      target.focus();
      // centrado y hacer visible el card
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      const parentRow = target.closest(".row");
      if (parentRow) parentRow.scrollIntoView({ behavior: "smooth", block: "start" });
      e.preventDefault();
    }
  };

  document.body.addEventListener("keydown", keyHandler);
  // conservamos referencia si queremos removerlo (en cleanupHome)
  homeState._keyHandler = keyHandler;
  homeState.keyListenerAttached = true;
}

// cleanup si es necesario desde SPA
function cleanupHome() {
  // remover key handler en caso de estar
  if (homeState.keyListenerAttached && homeState._keyHandler) {
    document.body.removeEventListener("keydown", homeState._keyHandler);
    homeState.keyListenerAttached = false;
    homeState._keyHandler = null;
  }
  // No limpiamos homeState.data para permitir caching
}
window.cleanupHome = cleanupHome;

// Inicializador principal que SPA invoca
function initializeHome() {
  // 1) leer defs (definiciones de columnas)
  try {
    homeState.defs = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
    if (!Array.isArray(homeState.defs)) homeState.defs = [];
  } catch (e) {
    homeState.defs = [];
  }

  const carouselEl = document.getElementById("carousel");
  if (!carouselEl) {
    console.error("scripthome: No encontré #carousel en DOM.");
    return;
  }

  // attach key nav (solo una vez)
  attachKeyNav();

  // 2) cargar datos si no los tenemos
  if (!homeState.data) {
    fetch("moviebase.json")
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(json => {
        homeState.data = json || [];
        const first = initCarousel();
        // focus inicial en primer card y carga detalle
        if (first) {
          first.focus();
          homeState.lastFocus = { row: 0, card: 0 };
          // buscamos el primer item real para detalle (si existe)
          const firstItem = (homeState.data && homeState.data[0]) || null;
          if (firstItem) focusCard(firstItem);
        }
      })
      .catch(err => {
        console.error("scripthome: Error loading JSON", err);
        carouselEl.innerHTML = '<div style="color:red;padding:2rem;">Error loading data</div>';
      });
  } else {
    // si ya tenemos data, (re)construimos carrusel y restauramos foco
    const first = initCarousel();
    // si el carousel fue reconstruido, restaurar foco guardado
    restoreFocus();
  }
}

// expongo para SPA
window.initializeHome = initializeHome;
