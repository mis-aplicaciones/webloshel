// scripthome.js (versión que intenta leer carouselDefs.json desde la raíz, luego REMOTE url y luego localStorage)

let data = null;
let defs = null;
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;

// Si quieres apuntar a una URL pública (raw.githubusercontent o pages) ponla aquí.
// Ejemplo: "https://raw.githubusercontent.com/miusuario/mirepo/main/carouselDefs.json"
const REMOTE_DEFS_URL = "https://raw.githubusercontent.com/mis-aplicaciones/webloshel/main/carouselDefs.json"; // pon aquí la URL RAW si la tienes

// Helper estrellas
function calcularEstrellas(p) {
  const MAX = 5;
  const r = Math.round((p || 0) * 2) / 2;
  const full = Math.floor(r), half = r % 1 !== 0;
  let html = "";
  for (let i = 0; i < full; i++) html += '<ion-icon name="star"></ion-icon>';
  if (half) html += '<ion-icon name="star-half"></ion-icon>';
  for (let i = 0; i < MAX - full - (half ? 1 : 0); i++) html += '<ion-icon name="star-outline"></ion-icon>';
  return html;
}

// updateDetails, focusCard, shuffle helpers (idénticos a tu versión robusta)
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
    if (el) { el.classList.remove("fade-in"); el.classList.add("fade-out"); }
  });

  const onEnd = (e) => {
    if (e && e.propertyName && e.propertyName !== "opacity") return;
    if (bg) bg.removeEventListener("transitionend", onEnd);
    updateDetails(item);
    [bg, detail, img, title, meta, genEl].forEach(el => {
      if (el) { el.classList.remove("fade-out"); el.classList.add("fade-in"); }
    });
    setTimeout(() => { isAnimating = false; }, 300);
  };

  if (bg) {
    bg.addEventListener("transitionend", onEnd, { once: true });
    setTimeout(onEnd, 800); // fallback
  } else {
    onEnd();
  }
}

// RNG + shuffle
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

// initCarousel (mezcla por fila usando seed diario)
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
  carousel.innerHTML = "";
  let firstCard = null;

  const daySeed = Math.floor(Date.now() / 86400000);

  if (!Array.isArray(defs)) defs = [];

  defs.forEach((def, rowIdx) => {
    let items = [];
    try {
      if (def.type === "field") {
        items = data.filter(item => {
          const v = item[def.field];
          if (v === undefined) return false;
          return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
        });
      } else if (def.type === "rating") {
        items = data.filter(item => Number(item.rating || 0) >= Number(def.minRating || 0));
      } else if (def.type === "collection") {
        items = data.filter(item => (def.ids || []).includes(item.id));
      } else if (def.type === "search") {
        const term = (def.term || "").toLowerCase();
        items = data.filter(item => (item.title||"").toLowerCase().includes(term) || (item.sinopsis||"").toLowerCase().includes(term));
      }
    } catch (err) {
      console.warn("initCarousel: error filtrando def", def, err);
      items = [];
    }

    if (!items || !items.length) return;

    const seed = (daySeed + rowIdx + 1) >>> 0;
    const rng = mulberry32(seed);
    const shuffled = shuffleWithRng(items, rng);

    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";
    cont.style.overflowX = "auto";
    cont.style.overflowY = "hidden";

    // almacenar scrollLeft por fila
    cont.addEventListener("scroll", () => {
      row.dataset.scrollLeft = cont.scrollLeft;
    });

    shuffled.forEach((item, idx) => {
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

      card.addEventListener("click", () => { if (item.link) window.location.href = item.link; });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" && item.link) window.location.href = item.link; });

      cont.appendChild(card);
      if (!firstCard) firstCard = card;
    });

    row.appendChild(title);
    row.appendChild(cont);
    carousel.appendChild(row);
  });

  return firstCard;
}

// restoreFocus (restaura scrollLeft y foco)
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

  const card = rowEl.querySelectorAll(".card")[lastFocus.card];
  if (card) {
    card.focus();
    // reconstruir items del def y actualizar detalles
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
    } else if (def.type === "collection") {
      items = data.filter(i => def.ids.includes(i.id));
    } else if (def.type === "search") {
      const term = (def.term || "").toLowerCase();
      items = data.filter(i => (i.title||"").toLowerCase().includes(term) || (i.sinopsis||"").toLowerCase().includes(term));
    }
    const item = items[Math.min(lastFocus.card, items.length - 1)];
    if (item) updateDetails(item);
  }
}

// teclado (tu bloque funcional)
document.body.addEventListener("keydown", (e) => {
  const active = document.activeElement;
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
        if (target) { target.focus(); nr.scrollIntoView({ behavior: "smooth", block: "start" }); }
      }
      break;
    }

    case "ArrowUp": {
      const pr = row.previousElementSibling;
      if (pr) {
        target = pr.querySelector(".card");
        if (target) { target.focus(); pr.scrollIntoView({ behavior: "smooth", block: "start" }); }
      }
      break;
    }
  }

  if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) e.preventDefault();
});

// ---------------------- CARGA DE DEFS ----------------------
// Intenta en orden: 1) /carouselDefs.json (root del paquete), 2) REMOTE_DEFS_URL (si está), 3) localStorage
function tryFetchWithTimeout(url, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const id = setTimeout(() => { controller.abort(); }, timeout);
    fetch(url, { signal: controller.signal, mode: 'cors' })
      .then(r => { clearTimeout(id); if (!r.ok) throw new Error('Not OK'); return r.json(); })
      .then(json => resolve(json))
      .catch(err => { clearTimeout(id); reject(err); });
  });
}

function loadDefsPriority() {
  return new Promise(async (resolve) => {
    // 1) intentar archivo en la raíz del mismo origen (útil si lo incluyes en la APK o en la raíz del hosting)
    try {
      const json = await tryFetchWithTimeout('/carouselDefs.json', 3000);
      if (Array.isArray(json)) { defs = json; resolve(); return; }
    } catch (e) {
      // continúa al siguiente intento
    }

    // 2) si REMOTE_DEFS_URL está configurada, intentar
    if (REMOTE_DEFS_URL) {
      try {
        const json = await tryFetchWithTimeout(REMOTE_DEFS_URL, 4000);
        if (Array.isArray(json)) { defs = json; resolve(); return; }
      } catch (e) {
        // continúa
      }
    }

    // 3) fallback: localStorage
    try {
      const ls = JSON.parse(localStorage.getItem('carouselDefs') || '[]');
      defs = Array.isArray(ls) ? ls : [];
    } catch {
      defs = [];
    }
    resolve();
  });
}

// inicializador
function initializeHome() {
  const car = document.getElementById("carousel");
  if (!car) { console.error("initializeHome: no encontré #carousel"); return; }

  loadDefsPriority().then(() => {
    if (!defs || !defs.length) {
      // Si quieres cambiar el fallback por defecto edítalo aquí
      defs = [
        { name:"Estrenos 2025", type:"field", field:"año", values:["2025"] },
        { name:"Acción", type:"field", field:"genero", values:["Acción"] },
        { name:"Top Valoradas", type:"rating", minRating:3.5 }
      ];
    }

    if (!data) {
      fetch("moviebase.json")
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(json => {
          data = json || [];
          const first = initCarousel();
          if (first) { first.focus(); lastFocus = { row:0, card:0 }; const firstItem = data.find(it=>it.id===1) || data[0]; if(firstItem) focusCard(firstItem); }
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
