// scripthome.js  (base provista por ti, con randomización por fila y opción remote defs)

// estado global (mantener compatibles con cualquier reinserción)
let data = null;
let defs = null;
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;

// Si quieres que el home consuma defs desde un JSON alojado (admin -> escribe ese JSON)
// pon la URL aquí; si la dejas null, se usará localStorage tal como ahora.
const REMOTE_DEFS_URL = null; // ejemplo: "https://mi-servidor.com/carouselDefs.json"

// ---------------- helper: estrellas ----------------
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

// ----------------- animación detalle -----------------
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
    // fallback por si no ocurre transitionend
    setTimeout(onEnd, 800);
  } else {
    onEnd();
  }
}

// ----------------- seeded RNG + shuffle -----------------
// mulberry32 PRNG
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle usando PRNG
function shuffleWithRng(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----------------- initCarousel (con random diario) -----------------
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
  carousel.innerHTML = "";
  let firstCard = null;

  // Día en UTC (cada 24h varía): usar floor(Date.now()/86400000)
  const daySeed = Math.floor(Date.now() / 86400000);

  if (!Array.isArray(defs)) defs = [];

  defs.forEach((def, rowIdx) => {
    // obtener items filtrados SAFELY (si campo no existe, reportamos y devolvemos [])
    let items = [];
    try {
      if (def.type === "field") {
        items = data.filter(item => {
          const v = item[def.field];
          if (v === undefined) return false;
          return Array.isArray(v)
            ? v.some(x => def.values.includes(x))
            : def.values.includes(v);
        });
      } else if (def.type === "rating") {
        items = data.filter(item => Number(item.rating || 0) >= Number(def.minRating || 0));
      } else if (def.type === "collection") {
        items = data.filter(item => (def.ids || []).includes(item.id));
      } else {
        // fallback: intentar filtrar por propiedad "field" si existe
        if (def.field) {
          items = data.filter(item => {
            const v = item[def.field];
            if (v === undefined) return false;
            return Array.isArray(v)
              ? v.some(x => def.values.includes(x))
              : def.values.includes(v);
          });
        }
      }
    } catch (err) {
      console.warn("initCarousel: error filtrando def", def, err);
      items = [];
    }

    if (!items || !items.length) return;

    // mezclar con semilla: daySeed combinado con rowIdx para que cada fila tenga su propia mezcla.
    const seed = (daySeed + rowIdx + 1) >>> 0;
    const rng = mulberry32(seed);
    const shuffled = shuffleWithRng(items, rng);

    // construir row
    const row = document.createElement("div");
    row.className = "row";

    // Mantener altura original más algo de margen para zoom — si quieres ajustar, cambia el valor
    // NO sobrescribo estilos que rompan tu template, sólo dejo posibilidad si quieres.
    // row.style.height = "calc(3vh + 19.1vh + 4vh)"; // si quieres cambiarlo, activar

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";
    // evitar scrollbars visibles (CSS idealmente), pero aseguramos overflow
    cont.style.overflowX = "auto";
    cont.style.overflowY = "hidden";

    // opcional: almacenar scrollLeft por fila
    cont.addEventListener("scroll", () => {
      row.dataset.scrollLeft = cont.scrollLeft;
    });

    shuffled.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl || ""}')`;
      // guardar link para Enter/click
      card.dataset.link = item.link || "";

      card.addEventListener("focus", () => {
        lastFocus = { row: rowIdx, card: idx };
        focusCard(item);
        // centrar visibilidad horizontalmente (si tu CSS requiere, se puede ajustar)
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

    row.appendChild(title);
    row.appendChild(cont);
    carousel.appendChild(row);
  });

  return firstCard;
}

// ----------------- restoreFocus (mantener tu lógica, restaurando scrollLeft) -------------
function restoreFocus() {
  const rows = document.querySelectorAll("#carousel .row");
  const rowEl = rows[lastFocus.row];
  if (!rowEl) return;

  // hacemos visible la fila correctamente (título + fila)
  rowEl.scrollIntoView({ behavior: "smooth", block: "start" });

  // restaurar scrollLeft horizontal si existía
  const cont = rowEl.querySelector(".cards-container");
  if (cont) {
    const stored = Number(rowEl.dataset.scrollLeft || 0);
    if (!isNaN(stored)) cont.scrollLeft = stored;
  }

  const card = rowEl.querySelectorAll(".card")[lastFocus.card];
  if (card) {
    card.focus();
    // actualizar detalles para el ítem concreto: reconstruir items del def
    const def = defs[lastFocus.row];
    if (!def) return;
    let items = [];
    if (def.type === "field") {
      items = data.filter(i => {
        const v = i[def.field];
        if (v === undefined) return false;
        return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = data.filter(i => i.rating >= def.minRating);
    } else {
      items = data.filter(i => def.ids.includes(i.id));
    }
    const item = items[Math.min(lastFocus.card, items.length - 1)];
    if (item) updateDetails(item);
  }
}

// ----------------- teclado: mantengo tu bloque que funciona --------------
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

// ----------------- carga de defs: remoto opcional + fallback localStorage -------------
function loadDefsFromRemoteIfNeeded() {
  return new Promise((resolve) => {
    if (!REMOTE_DEFS_URL) {
      // fallback directo a localStorage
      try {
        const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
        defs = Array.isArray(ls) ? ls : [];
      } catch {
        defs = [];
      }
      resolve();
      return;
    }

    // intentamos fetch remoto (con timeout)
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);

    fetch(REMOTE_DEFS_URL, { signal: controller.signal })
      .then(r => {
        clearTimeout(id);
        if (!r.ok) throw new Error("No OK");
        return r.json();
      })
      .then(json => {
        if (Array.isArray(json)) {
          defs = json;
          // también guardamos localmente como copia
          try { localStorage.setItem("carouselDefs", JSON.stringify(json)); } catch {}
        } else {
          // fallback local
          try {
            const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
            defs = Array.isArray(ls) ? ls : [];
          } catch {
            defs = [];
          }
        }
      })
      .catch(() => {
        // fallback a localStorage
        try {
          const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
          defs = Array.isArray(ls) ? ls : [];
        } catch {
          defs = [];
        }
      })
      .finally(() => resolve());
  });
}

// ----------------- inicializador (mantengo tu estructura) ------------------
function initializeHome() {
  const car = document.getElementById("carousel");
  if (!car) {
    console.error("initializeHome: no encontré #carousel");
    return;
  }

  // Cargar defs (remote o local)
  loadDefsFromRemoteIfNeeded().then(() => {
    // si no hay defs, mantenemos un set por defecto (como tu fallback)
    if (!defs || !defs.length) {
      defs = [
        { name:"Estrenos 2025", type:"field",   field:"año",     values:["2025"] },
        { name:"Acción",        type:"field",   field:"genero",  values:["Acción"] },
        { name:"Top Valoradas", type:"rating",  minRating:3.5 }
      ];
    }

    if (!data) {
      fetch("moviebase.json")
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(json => {
          data = json || [];
          const first = initCarousel();
          if (first) {
            first.focus();
            lastFocus = { row: 0, card: 0 };
            // intenta seleccionar item con id 1 si existe, si no el primero
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
