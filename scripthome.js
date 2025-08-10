// scripthome.js  (versión corregida: toma todas las defs del admin y soporta 'search')

let data = null;
let defs = null;
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;

// Si quieres cargar defs desde URL remota ponla aquí, si no null -> usa localStorage.
const REMOTE_DEFS_URL = null;

// ---------------- helper estrellas ----------------
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

// ---------------- update details ----------------
function updateDetails(item) {
  if (!item) return;
  const bg    = document.getElementById("background");
  const img   = document.getElementById("detail-img");
  const title = document.getElementById("detail-title");
  const meta  = document.getElementById("detail-meta");
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

// ---------------- focus detalle con animación ----------------
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
    if (e && e.propertyName && e.propertyName !== "opacity") return;
    if (bg) bg.removeEventListener("transitionend", onEnd);
    updateDetails(item);
    [bg, detail, img, title, meta, genEl].forEach(el => {
      if (el) {
        el.classList.remove("fade-out");
        el.classList.add("fade-in");
      }
    });
    setTimeout(() => { isAnimating = false; }, 300);
  };

  if (bg) {
    bg.addEventListener("transitionend", onEnd, { once: true });
    setTimeout(onEnd, 800);
  } else {
    onEnd();
  }
}

// ----------------- seeded RNG + shuffle (si quieres mantener shuffle diario) -----------------
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleWithRng(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----------------- Construcción del carrusel (AHORA: crea todas las filas del admin) -----------------
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
  carousel.innerHTML = "";
  let firstCard = null;

  // día UTC para semilla (si usas shuffle por fila)
  const daySeed = Math.floor(Date.now() / 86400000);

  if (!Array.isArray(defs)) defs = [];

  console.log("scripthome: renderizando", defs.length, "columnas");

  defs.forEach((def, rowIdx) => {
    // filtrar items dependiendo del tipo (incluye ahora 'search')
    let items = [];
    try {
      if (def.type === "field") {
        // si def.values no existe o está vacío -> devolvemos [] (fila vacía visible)
        const vals = Array.isArray(def.values) ? def.values : [];
        if (vals.length) {
          items = data.filter(item => {
            const v = item[def.field];
            if (v === undefined || v === null) return false;
            if (Array.isArray(v)) return v.some(x => vals.includes(x));
            return vals.includes(String(v));
          });
        } else {
          items = [];
        }
      } else if (def.type === "rating") {
        const minR = Number(def.minRating || 0);
        items = data.filter(item => Number(item.rating || 0) >= minR);
      } else if (def.type === "collection") {
        const ids = Array.isArray(def.ids) ? def.ids.map(Number) : [];
        items = data.filter(item => ids.includes(Number(item.id)));
      } else if (def.type === "search") {
        // soporta search por term (titulo/sinopsis) o ids si el admin seleccionó ids
        if (Array.isArray(def.ids) && def.ids.length) {
          const ids = def.ids.map(Number);
          items = data.filter(d => ids.includes(Number(d.id)));
        } else if (def.term && def.term.trim()) {
          const t = def.term.toLowerCase();
          items = data.filter(d => (d.title || "").toLowerCase().includes(t) || (d.sinopsis || "").toLowerCase().includes(t));
        } else {
          items = [];
        }
      } else {
        // tipo desconocido: intentar fallback a field si existe 'field' en def
        if (def.field && Array.isArray(def.values) && def.values.length) {
          const vals = def.values;
          items = data.filter(item => {
            const v = item[def.field];
            if (v === undefined || v === null) return false;
            if (Array.isArray(v)) return v.some(x => vals.includes(x));
            return vals.includes(String(v));
          });
        } else {
          items = [];
        }
      }
    } catch (err) {
      console.warn("Error filtrando def:", def, err);
      items = [];
    }

    // mezclar por fila (opcional): si quieres quitar, comenta estas 3 lineas
    const seed = (daySeed + rowIdx + 1) >>> 0;
    const rng = mulberry32(seed);
    if (items && items.length > 1) items = shuffleWithRng(items, rng);

    // crear fila (siempre la creamos, aunque items.length === 0)
    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "(Sin título)";

    const cont = document.createElement("div");
    cont.className = "cards-container";
    cont.style.overflowX = "auto";
    cont.style.overflowY = "hidden";

    // placeholder cuando no hay items
    if (!items || !items.length) {
      const empty = document.createElement("div");
      empty.className = "row-empty";
      empty.textContent = "No hay elementos para esta columna";
      empty.style.opacity = "0.45";
      empty.style.padding = "1rem";
      cont.appendChild(empty);
    } else {
      items.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = "card";
        card.tabIndex = 0;
        card.style.backgroundImage = `url('${item.cardimgUrl || ""}')`;
        card.dataset.link = item.link || "";

        card.addEventListener("focus", () => {
          lastFocus = { row: rowIdx, card: idx };
          focusCard(item);
          const contEl = card.closest(".cards-container");
          if (contEl) {
            const offset = Math.max(0, card.offsetLeft - (contEl.clientWidth / 2 - card.clientWidth / 2));
            contEl.scrollLeft = offset;
            row.dataset.scrollLeft = offset;
          }
        });

        card.addEventListener("click", () => {
          if (item.link) window.location.href = item.link;
        });

        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && item.link) window.location.href = item.link;
        });

        cont.appendChild(card);
        if (!firstCard) firstCard = card;
      });
    }

    // guardar conteiner scroll cuando se mueve
    cont.addEventListener("scroll", () => {
      row.dataset.scrollLeft = cont.scrollLeft;
    });

    row.appendChild(title);
    row.appendChild(cont);
    carousel.appendChild(row);

    console.log(`Columna '${def.name}' (${def.type}) -> items: ${items.length}`);
  });

  return firstCard;
}

// ----------------- restoreFocus (restaura scrollLeft de la fila) -------------
function restoreFocus() {
  const rows = document.querySelectorAll("#carousel .row");
  const rowEl = rows[lastFocus.row];
  if (!rowEl) return;

  rowEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const cont = rowEl.querySelector(".cards-container");
  if (cont) {
    const stored = Number(rowEl.dataset.scrollLeft || 0);
    if (!isNaN(stored)) cont.scrollLeft = stored;
  }

  const cards = rowEl.querySelectorAll(".card");
  const card = cards[lastFocus.card];
  if (card) {
    card.focus();
    // reconstruir items del def y actualizar detalles
    const def = defs[lastFocus.row];
    if (!def) return;
    let items = [];
    if (def.type === "field") {
      const vals = Array.isArray(def.values) ? def.values : [];
      if (vals.length) {
        items = data.filter(i => {
          const v = i[def.field];
          if (v === undefined || v === null) return false;
          if (Array.isArray(v)) return v.some(x => vals.includes(x));
          return vals.includes(String(v));
        });
      }
    } else if (def.type === "rating") {
      items = data.filter(i => Number(i.rating || 0) >= Number(def.minRating || 0));
    } else if (def.type === "collection") {
      items = data.filter(i => (def.ids || []).includes(i.id));
    } else if (def.type === "search") {
      if (Array.isArray(def.ids) && def.ids.length) {
        items = data.filter(d => def.ids.includes(d.id));
      } else if (def.term) {
        const t = def.term.toLowerCase();
        items = data.filter(d => (d.title || "").toLowerCase().includes(t) || (d.sinopsis || "").toLowerCase().includes(t));
      }
    }

    const item = items[Math.min(lastFocus.card, items.length - 1)];
    if (item) updateDetails(item);
  }
}

// ----------------- teclado: bloque que dijiste funciona ----------------
document.body.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  // botón volver
  if (["Backspace", "Escape"].includes(e.key)) {
    window.dispatchEvent(new Event("return-to-sidebar"));
    e.preventDefault();
    return;
  }
  if (!active || !active.classList || !active.classList.contains("card")) return;

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
        target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
      break;

    case "ArrowLeft":
      if (idx === 0) {
        // Primer card: volvemos al sidebar
        window.dispatchEvent(new Event("return-to-sidebar"));
        e.preventDefault();
        return;
      }
      if (idx > 0) {
        target = cards[idx - 1];
        target.focus();
        target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
      break;

    case "ArrowDown": {
      const nr = row.nextElementSibling;
      if (nr) {
        target = nr.querySelector(".card");
        if (target) {
          target.focus();
          nr.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      break;
    }

    case "ArrowUp": {
      const pr = row.previousElementSibling;
      if (pr) {
        target = pr.querySelector(".card");
        if (target) {
          target.focus();
          pr.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      break;
    }
  }

  if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
  }
});

// ----------------- carga defs desde remoto (opcional) o localStorage -------------
function loadDefsFromRemoteIfNeeded() {
  return new Promise((resolve) => {
    if (!REMOTE_DEFS_URL) {
      try {
        const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
        defs = Array.isArray(ls) ? ls : [];
      } catch {
        defs = [];
      }
      console.log("scripthome: defs cargadas desde localStorage:", defs.length);
      resolve();
      return;
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);

    fetch(REMOTE_DEFS_URL, { signal: controller.signal })
      .then(r => { clearTimeout(id); if (!r.ok) throw new Error("No OK"); return r.json(); })
      .then(json => {
        if (Array.isArray(json)) {
          defs = json;
          try { localStorage.setItem("carouselDefs", JSON.stringify(json)); } catch {}
        } else {
          try { const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]"); defs = Array.isArray(ls) ? ls : []; } catch { defs = []; }
        }
      })
      .catch(() => {
        try { const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]"); defs = Array.isArray(ls) ? ls : []; } catch { defs = []; }
      })
      .finally(() => {
        console.log("scripthome: defs cargadas (remote fallback local):", defs.length);
        resolve();
      });
  });
}

// ----------------- inicializador (mantiene tu estructura y comportamiento) ------------------
function initializeHome() {
  const car = document.getElementById("carousel");
  if (!car) {
    console.error("initializeHome: no encontré #carousel");
    return;
  }

  loadDefsFromRemoteIfNeeded().then(() => {
    // Si defs está vacío, dejamos el arreglo vacío (pero no forzamos los 3 por defecto).
    if (!defs || !Array.isArray(defs)) defs = [];

    if (!data) {
      fetch("moviebase.json")
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(json => {
          data = json || [];
          const first = initCarousel();
          if (first) {
            first.focus();
            lastFocus = { row: 0, card: 0 };
            const firstItem = data.find(it => it.id === 1) || data[0];
            if (firstItem) focusCard(firstItem);
          }
        })
        .catch(err => {
          console.error("initializeHome: error al cargar moviebase.json", err);
          car.innerHTML = '<div style="color:red;padding:2rem;">Error al cargar los datos.</div>';
        });
    } else {
      if (!car.children.length) initCarousel();
      restoreFocus();
    }
  });
}

window.initializeHome = initializeHome;
