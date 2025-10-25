// scripthome.js (versión mejorada para películas + series + remote defs + shuffle diario)
// Parte del comportamiento original se ha mantenido fielmente (focos, restauración, animaciones).

/* estado global */
let movieData = null;    // array de películas (moviebase.json)
let seriesData = null;   // array de series  (seriebase.json)
let defs = null;         // definiciones de columnas (desde carouselDefs.json o localStorage)
let lastFocus = { row: 0, card: 0 };
let isAnimating = false;
// al tope de scripthome.js (global)
let bgLoadId = 0;                 // para evitar condiciones de carrera en precarga de fondo
const bgImageCache = new Map();   // cache simple: url -> loaded Image object

// Optimizaciones de rendimiento
const CARD_IMAGE_CACHE = new Map();  // Cache para imágenes de cards
let focusDebounceTimeout = null;     // Debounce para eventos de focus
let isScrolling = false;             // Flag para evitar múltiples scrolls


/* CONFIG */
const REMOTE_DEFS_URL = null; // si quieres forzar una URL remota, ponla aquí (opcional)
const LOCAL_DEFS_FILENAME = "./carouselDefs.json"; // archivo en la raíz que el admin puede subir

/* ---- helper: estrellas ---- */
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

/* ---- actualizar detalle (sin animación) ---- */
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

/* ---- animación detalle (optimizada con debounce) ---- */
function focusCard(item) {
  if (!item) return;
  
  // Debounce para evitar múltiples llamadas rápidas
  clearTimeout(focusDebounceTimeout);
  focusDebounceTimeout = setTimeout(() => {
    executeFocusCard(item);
  }, 50); // 50ms de debounce
}

function executeFocusCard(item) {
  if (!item) return;
  
  // si ya está en animación, actualizamos solo los detalles textuales
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

  // fade-out visual en todos los elementos (si existen)
  [bg, detail, img, title, meta, genEl].forEach(el => {
    if (el) {
      el.classList.remove("fade-in");
      el.classList.add("fade-out");
    }
  });

  // id de carga actual (se incrementa para invalidar cargas anteriores)
  const myLoadId = ++bgLoadId;
  const bgUrl = item.backgroundUrl || "";

  // función que aplica la imagen ya "segura" (cuando esté precargada o fallback)
  const applyBackgroundAndDetails = () => {
    // ignora si ya vino una carga posterior
    if (myLoadId !== bgLoadId) return;

    // aplicar background, detalles y fade-in
    if (bg) bg.style.backgroundImage = `url('${bgUrl}')`;
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

    [bg, detail, img, title, meta, genEl].forEach(el => {
      if (el) {
        el.classList.remove("fade-out");
        el.classList.add("fade-in");
      }
    });

    // dejar un pequeño debounce antes de liberar la bandera
    setTimeout(() => { if (myLoadId === bgLoadId) isAnimating = false; }, 300);
  };

  // Si ya tenemos la imagen en cache y cargada -> aplicar inmediatamente
  if (bgUrl && bgImageCache.has(bgUrl) && bgImageCache.get(bgUrl).complete) {
    applyBackgroundAndDetails();
    return;
  }

  // Si no hay URL, aplicar detalles sin background
  if (!bgUrl) {
    applyBackgroundAndDetails();
    return;
  }

  // precargar imagen (nuevo Image)
  const imgLoader = new Image();
  imgLoader.src = bgUrl;

  // cuando cargue, si es la carga vigente, guardamos en cache y aplicamos
  imgLoader.onload = () => {
    bgImageCache.set(bgUrl, imgLoader);
    if (myLoadId === bgLoadId) applyBackgroundAndDetails();
  };

  imgLoader.onerror = () => {
    // en caso de error simplemente aplicamos detalles sin cambiar background
    if (myLoadId === bgLoadId) applyBackgroundAndDetails();
  };

  // fallback: si el load tarda demasiado, forzamos aplicar después de 800ms
  setTimeout(() => {
    if (myLoadId === bgLoadId) applyBackgroundAndDetails();
  }, 800);
}


/* ---- PRNG (mulberry32) + shuffle con RNG -- mantiene mezcla diaria por fila ---- */
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

/* ---- util: cargar JSON (fetch con fallback) ---- */
function fetchJsonSafe(path) {
  return fetch(path).then(r => {
    if (!r.ok) throw new Error(`status ${r.status}`);
    return r.json();
  });
}

/* ---- determinar source para una definición ----
   si def.field === 'tipo' y def.values incluye '2' => usar seriesData
   en caso contrario usar movieData
   (esto permite filas mixtas: unas filas usan movieData y otras seriesData)
*/
function itemsForDef(def) {
  // Si def explicitamente contiene source property, respetarla:
  // def.source === "series" | "movies"
  let source = movieData;
  if (def.source === "series") source = seriesData;
  else if (def.source === "movies") source = movieData;
  else if (def.field === "tipo") {
    // field 'tipo' puede tener values like ["2"] or [2] or ["1","2"]
    const vals = (def.values || []).map(v => String(v));
    if (vals.includes("2")) source = seriesData;
    else source = movieData;
  } else {
    // Por defecto movies (si en el admin el usuario quiere series debe usar field 'tipo' o source)
    source = movieData;
  }

  if (!source) return [];

  let items = [];
  try {
    if (def.type === "field") {
      items = source.filter(item => {
        const v = item[def.field];
        if (v === undefined) return false;
        return Array.isArray(v) ? v.some(x => def.values.includes(x)) : def.values.includes(v);
      });
    } else if (def.type === "rating") {
      items = source.filter(item => Number(item.rating || 0) >= Number(def.minRating || 0));
    } else if (def.type === "collection") {
      // def.ids puede mezclar ids de series y películas; comparar laxamente (string/number)
      const idset = new Set((def.ids || []).map(x => String(x)));
      items = source.filter(item => idset.has(String(item.id)));
    } else if (def.type === "search") {
      // podemos usar def.term o def.ids
      if (def.ids && def.ids.length) {
        const idset = new Set(def.ids.map(x => String(x)));
        items = source.filter(item => idset.has(String(item.id)));
      } else if (def.term) {
        const q = String(def.term).toLowerCase();
        items = source.filter(item => {
          const t = (item.title || "").toLowerCase();
          const s = (item.sinopsis || "").toLowerCase();
          return t.includes(q) || s.includes(q);
        });
      }
    }
  } catch (err) {
    console.warn("itemsForDef error", def, err);
    items = [];
  }

  return items || [];
}

/* ---- initCarousel: construye filas (mezcla diaria por fila) ---- */
function initCarousel() {
  const carousel = document.getElementById("carousel");
  if (!carousel) return null;
  carousel.innerHTML = "";
  let firstCard = null;

  // seed diario UTC (cambia cada 24h)
  const daySeed = Math.floor(Date.now() / 86400000);

  if (!Array.isArray(defs)) defs = [];

  defs.forEach((def, rowIdx) => {
    const itemsRaw = itemsForDef(def);
    if (!itemsRaw || !itemsRaw.length) return;

    // Shuffle con semilla única por fila
    const seed = (daySeed + rowIdx + 1) >>> 0;
    const rng = mulberry32(seed);
    const shuffled = shuffleWithRng(itemsRaw, rng);

    // Construir DOM
    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = def.name || "";

    const cont = document.createElement("div");
    cont.className = "cards-container";
    cont.style.overflowX = "auto";
    cont.style.overflowY = "hidden";

    // guardar scrollLeft por fila
    cont.addEventListener("scroll", () => {
      row.dataset.scrollLeft = cont.scrollLeft;
    });

    shuffled.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;
      card.style.backgroundImage = `url('${item.cardimgUrl || ""}')`;
      card.dataset.link = item.link || "";
      // en caso de series, podrías poner dataset.tipo = 2 (si lo necesitas)
      card.dataset.itemId = String(item.id);

      card.addEventListener("focus", () => {
        lastFocus = { row: rowIdx, card: idx };
        focusCard(item);
        // centrar el card en su contenedor horizontal (optimizado)
        const contEl = card.closest(".cards-container");
        if (contEl && !isScrolling) {
          isScrolling = true;
          requestAnimationFrame(() => {
            const offset = Math.max(0, card.offsetLeft - (contEl.clientWidth / 2 - card.clientWidth / 2));
            contEl.scrollLeft = offset;
            row.dataset.scrollLeft = offset;
            isScrolling = false;
          });
        }
      });

      card.addEventListener("click", () => {
        // Sistema universal: usar HTML único por ID
        const isSeries = item.tipo === 2;
        const baseUrl = isSeries ? 'series/index.html' : 'peliculas/index.html';
        const url = `${baseUrl}?id=${item.id}`;
        window.location.href = url;
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const isSeries = item.tipo === 2;
          const baseUrl = isSeries ? 'series/index.html' : 'peliculas/index.html';
          const url = `${baseUrl}?id=${item.id}`;
          window.location.href = url;
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

/* ---- restoreFocus: restablece fila, scrollLeft y card enfocado ---- */
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
    // reconstruir items para esa def y actualizar detalles
    const def = defs[lastFocus.row];
    if (!def) return;
    const items = itemsForDef(def);
    const item = items[Math.min(lastFocus.card, items.length - 1)];
    if (item) updateDetails(item);
  }
}

/* ---- teclado: mantengo tu bloque original con la mejora "izquierda en primer card va al sidebar" ---- */
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
        // Primer card: volvemos al sidebar (solicitud tuya)
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

/* ---- cargar defs: intenta ./carouselDefs.json -> localStorage -> remote (raw) ---- */
function loadDefsFromRemoteIfNeeded() {
  return new Promise((resolve) => {
    // 1) intentar archivo local en la raíz (./carouselDefs.json)
    fetch(LOCAL_DEFS_FILENAME)
      .then(r => {
        if (!r.ok) throw new Error("no local file");
        return r.json();
      })
      .then(json => {
        if (Array.isArray(json)) defs = json;
        else defs = [];
      })
      .catch(() => {
        // 2) fallback a localStorage
        try {
          const ls = JSON.parse(localStorage.getItem("carouselDefs") || "[]");
          defs = Array.isArray(ls) ? ls : [];
        } catch {
          defs = [];
        }
      })
      .finally(() => {
        // 3) si tenemos una URL remota guardada en localStorage intentar actualizar (opcional)
        const remote = localStorage.getItem("carouselDefsRemoteUrl") || REMOTE_DEFS_URL;
        if (!remote) {
          resolve();
          return;
        }

        // intentar fetch remoto (con timeout)
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);

        fetch(remote, { signal: controller.signal })
          .then(r => {
            clearTimeout(id);
            if (!r.ok) throw new Error("remote not ok");
            return r.json();
          })
          .then(json => {
            if (Array.isArray(json)) {
              defs = json;
              // opcional: guardar copia local para debugging
              try { localStorage.setItem("carouselDefs", JSON.stringify(json)); } catch {}
            }
          })
          .catch(() => {
            // si falla, mantener lo que ya tenemos (archivo local o localStorage)
          })
          .finally(() => resolve());
      });
  });
}

/* ---- cargar datos bases (películas y series) ---- */
function loadBasesIfNeeded() {
  return new Promise((resolve) => {
    const promises = [];
    if (!movieData) promises.push(fetchJsonSafe("moviebase.json").then(j => movieData = Array.isArray(j) ? j : [] ).catch(()=> movieData = []));
    if (!seriesData) promises.push(fetchJsonSafe("seriebase.json").then(j => seriesData = Array.isArray(j) ? j : [] ).catch(()=> seriesData = []));
    Promise.all(promises).finally(() => resolve());
  });
}

/* ---- initializeHome (entry point) ---- */
function initializeHome() {
  const car = document.getElementById("carousel");
  if (!car) {
    console.error("initializeHome: no encontré #carousel");
    return;
  }

  // Cargar defs y bases en paralelo
  loadDefsFromRemoteIfNeeded().then(() => {
    // fallback por defecto si no hay defs
    if (!Array.isArray(defs) || !defs.length) {
      defs = [
        { name:"Estrenos 2025", type:"field", field:"año", values:["2025"] },
        { name:"Acción",        type:"field", field:"genero", values:["Acción"] },
        { name:"Top Valoradas", type:"rating", minRating:3.5 }
      ];
    }

    // ahora cargar las bases (movie + serie) y construir
    loadBasesIfNeeded().then(() => {
      // construir carrusel
      const first = initCarousel();
      if (first) {
        first.focus();
        lastFocus = { row:0, card:0 };
        // elegir primer item para mostrar en detalle (intentar id 1 o el primero disponible)
        const firstItem = (movieData && movieData.find(it => String(it.id) === "1")) || (movieData && movieData[0]) || (seriesData && seriesData[0]);
        if (firstItem) focusCard(firstItem);
      } else {
        // sin filas => mostrar mensaje
        car.innerHTML = '<div style="color:#ccc;padding:2rem;">No hay filas definidas (revisa carouselDefs.json o localStorage).</div>';
      }
    });
  });
}

window.initializeHome = initializeHome;

/* ---- Nota al administrador / deploy:
   - Si deseas que el home cargue las definiciones desde la nube:
     1) Genera el archivo carouselDefs.json desde admin (exportar).
     2) Súbelo a la raíz de tu repo / hosting y asegúrate que la URL RAW sea accesible.
     3) En el admin puedes guardar esa RAW URL en localStorage con la clave 'carouselDefsRemoteUrl'.
        Ejemplo pequeño (añadir en admin.js):
          localStorage.setItem('carouselDefsRemoteUrl', 'https://raw.githubusercontent.com/USER/REPO/BRANCH/carouselDefs.json');
     4) El home intentará primero ./carouselDefs.json (archivo local en la raíz del proyecto),
        luego localStorage, luego la URL remota si existe.
*/
