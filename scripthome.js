// scripthome.js
// Estado global único (evita redeclaraciones al re-insertar script)
window.homeState = window.homeState || {
  data: null,
  defs: null,
  lastFocus: { row: 0, card: 0 },
  isAnimating: false,
  keyListenerAttached: false,
  _keyHandler: null
};

const homeState = window.homeState;

// helper: estrellas
function calcularEstrellas(p) {
  const MAX = 5;
  const r = Math.round((p || 0) * 2) / 2;
  const full = Math.floor(r);
  const half = r % 1 !== 0;
  let html = "";
  for (let i = 0; i < full; i++) html += '<ion-icon name="star"></ion-icon>';
  if (half) html += '<ion-icon name="star-half"></ion-icon>';
  for (let i = 0; i < MAX - full - (half ? 1 : 0); i++)
    html += '<ion-icon name="star-outline"></ion-icon>';
  return html;
}

// Actualiza detalles sin animación
function updateDetails(item) {
  if (!item) return;
  const bg = document.getElementById("background");
  const img = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta = document.getElementById("detail-meta");
  const genEl = document.getElementById("detail-genero");

  if (bg) bg.style.backgroundImage = `url('${item.backgroundUrl || ""}')`;
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

// animación detalle con fallback
function focusCard(item) {
  if (!item) return;
  if (homeState.isAnimating) {
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

  let doneCalled = false;
  const onEnd = (e) => {
    if (e && e.propertyName && e.propertyName !== "opacity") return;
    if (doneCalled) return;
    doneCalled = true;
    elems.forEach(el => el.removeEventListener("transitionend", onEnd));
    updateDetails(item);
    elems.forEach(el => {
      el.classList.remove("fade-out");
      el.classList.add("fade-in");
    });
    setTimeout(() => { homeState.isAnimating = false; }, 300);
  };

  if (bg) {
    bg.addEventListener("transitionend", onEnd, { once: true });
    setTimeout(onEnd, 600); // fallback
  } else {
    onEnd();
  }
}

// centra el card en su contenedor y guarda scrollLeft en el row.dataset
function ensureCardVisibilityAndStore(card) {
  if (!card) return;
  const row = card.closest(".row");
  if (!row) return;
  const cont = row.querySelector(".cards-container");
  if (!cont) return;

  // Calcular offset para centrar el card dentro de cont
  const offset = Math.max(0, card.offsetLeft - (cont.clientWidth / 2 - card.clientWidth / 2));
  // animado si soporta
  try {
    cont.scrollTo({ left: offset, behavior: "smooth" });
  } catch (e) {
    cont.scrollLeft = offset;
  }
  // guardar
  row.dataset.scrollLeft = offset;
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
        return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = data.filter(item => item.rating >= def.minRating);
    } else if (def.type === "collection") {
      items = data.filter(item => def.ids.includes(item.id));
    }

    if (!items.length) return;

    const row = document.createElement("div");
    row.className = "row";

    // AUMENTO ALTURA: más espacio para zoom del card (puedes ajustar este calc)
    row.style.height = "calc(3vh + 19.1vh + 8vh)"; // aumento 8vh (ajustable)
    row.style.overflow = "visible"; // permitir zoom visible

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";

    // hacemos que cada cont pueda hacer scroll horizontal pero sin barras visibles (CSS también ayuda)
    cont.style.overflowX = "auto";
    cont.style.scrollBehavior = "smooth";
    cont.style.webkitOverflowScrolling = "touch";
    // Desactivar scroll vertical dentro de cards container
    cont.style.overflowY = "hidden";

    // Guardar scrollLeft cuando se mueva (para restaurar)
    cont.addEventListener("scroll", () => {
      row.dataset.scrollLeft = cont.scrollLeft;
    });

    items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl || ""}')`;
      card.dataset.link = item.link || "";

      // Focus: guardamos posición y actualizamos detalle (y centramos el card)
      card.addEventListener("focus", () => {
        homeState.lastFocus = { row: rowIdx, card: idx };
        ensureCardVisibilityAndStore(card);
        focusCard(item);
      });

      // Click / Enter abren link
      card.addEventListener("click", () => {
        if (item.link) window.location.href = item.link;
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && item.link) window.location.href = item.link;
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

// Restaura foco guardado y scroll horizontal de la fila
function restoreFocus() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;
  const rows = carousel.querySelectorAll(".row");
  if (!rows.length) return;

  let r = Math.max(0, Math.min(homeState.lastFocus.row, rows.length - 1));
  const rowEl = rows[r];
  if (!rowEl) return;

  // Hacer visible la fila en la zona activa (titulo + fila)
  rowEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const cont = rowEl.querySelector(".cards-container");
  const cards = rowEl.querySelectorAll(".card");
  if (!cards.length) {
    // fallback al primer card global
    const firstRow = rows[0];
    const firstCard = firstRow && firstRow.querySelector(".card");
    if (firstCard) firstCard.focus();
    return;
  }

  // Restaurar scrollLeft horizontal si existe
  const stored = Number(rowEl.dataset.scrollLeft || 0);
  if (cont && !isNaN(stored)) {
    try { cont.scrollLeft = stored; } catch (e) { /* ignore */ }
  }

  let c = Math.max(0, Math.min(homeState.lastFocus.card, cards.length - 1));
  const card = cards[c];
  if (card) {
    // focus al card restaurado y asegurar visibilidad
    card.focus();
    // centramos el card en cont si no coincide con stored
    ensureCardVisibilityAndStore(card);

    // Actualizar detalles usando la definición actual de la fila
    const def = (homeState.defs || [])[r];
    if (def) {
      let items = [];
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
}

// Key navigation (manteniendo tu bloque que funciona mejor)
// Si en primer card y ArrowLeft -> saltar al sidebar (return-to-sidebar)
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
        // si primer card -> saltar al sidebar (solamente en este caso)
        if (idx === 0) {
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
      // centrar el target en su contenedor y almacenar
      ensureCardVisibilityAndStore(target);
      // subir la fila a zona activa
      const parentRow = target.closest(".row");
      if (parentRow) parentRow.scrollIntoView({ behavior: "smooth", block: "start" });
      e.preventDefault();
    }
  };

  document.body.addEventListener("keydown", keyHandler);
  homeState._keyHandler = keyHandler;
  homeState.keyListenerAttached = true;
}

// Limpieza si SPA la necesita
function cleanupHome() {
  if (homeState.keyListenerAttached && homeState._keyHandler) {
    document.body.removeEventListener("keydown", homeState._keyHandler);
    homeState.keyListenerAttached = false;
    homeState._keyHandler = null;
  }
}
window.cleanupHome = cleanupHome;

// Inicializador
function initializeHome() {
  // leer defs
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

  if (!homeState.data) {
    fetch("moviebase.json")
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(json => {
        homeState.data = json || [];
        const first = initCarousel();
        if (first) {
          first.focus();
          homeState.lastFocus = { row: 0, card: 0 };
          const firstItem = (homeState.data && homeState.data[0]) || null;
          if (firstItem) focusCard(firstItem);
        }
      })
      .catch(err => {
        console.error("scripthome: Error loading JSON", err);
        carouselEl.innerHTML = '<div style="color:red;padding:2rem;">Error loading data</div>';
      });
  } else {
    // Reconstruir carrusel y restaurar foco/scroll
    const first = initCarousel();
    restoreFocus();
  }
}

window.initializeHome = initializeHome;  if (img) img.src = item.titleimgUrl || "";
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

