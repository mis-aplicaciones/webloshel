/* script.js - App principal con navegación dinámica de sidebar y carga de secciones */
document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen     = document.getElementById("loading-screen");
  const menuItems         = document.querySelectorAll(".sidebar .menu-item");
  const footerMenuItems   = document.querySelectorAll(".footer .menu-item");
  const contentContainer  = document.querySelector(".content");

  let currentFocus   = "menu";    // "menu" o "content"
  let currentScript  = null;

  /** Oculta pantalla de carga con fade */
  function hideLoadingScreen() {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      setTimeout(() => loadingScreen.style.display = "none", 500);
    }, 1000);
  }

  /**
   * Carga HTML de sección y su JS asociado.
   * data-section="home.html" en el menu permite inferir:
   *  - script: 'script-home.js'
   *  - función: initializeHome
   */
  function loadSection(sectionFile) {
    // limpiar JS previo
    if (currentScript) document.body.removeChild(currentScript);
    currentScript = null;

    // fetch del HTML
    fetch(sectionFile)
      .then(res => {
        if (!res.ok) throw new Error(`Error cargando ${sectionFile}`);
        return res.text();
      })
      .then(html => {
        contentContainer.innerHTML = html;
        initSectionScript(sectionFile);
      })
      .catch(err => {
        console.error(err);
        contentContainer.innerHTML = `<p>Error al cargar la sección</p>`;
      });
  }

  /**
   * Inyecta y ejecuta dinámicamente el script de la sección
   */
  function initSectionScript(sectionFile) {
    // inferir nombre base, ej "home" de "home.html"
    const base = sectionFile.replace(/\..+$/, "");
    const scriptName = `script${base.charAt(0).toUpperCase() + base.slice(1)}.js`;
    const initFnName = `initialize${base.charAt(0).toUpperCase() + base.slice(1)}`;

    const s = document.createElement("script");
    s.src = scriptName;
    s.onload = () => {
      if (typeof window[initFnName] === "function") {
        // desactivar listener sidebar
        document.removeEventListener("keydown", sidebarKeyListener);
        currentFocus = "content";
        window[initFnName]();
      } else {
        console.error(`La función ${initFnName} no existe en ${scriptName}`);
      }
    };
    document.body.appendChild(s);
    currentScript = s;
  }

  /**
   * Listener del sidebar: flechas y Enter
   */
  function sidebarKeyListener(e) {
    if (currentFocus !== "menu") return;
    const menuArr = Array.from(menuItems);
    const active  = menuArr.find(m => m.classList.contains("active"));
    let idx = menuArr.indexOf(active);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        idx = (idx + 1) % menuArr.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        idx = (idx - 1 + menuArr.length) % menuArr.length;
        break;
      case "Enter":
        e.preventDefault();
        const file = active.dataset.section;
        loadSection(file);
        return;
      default:
        return;
    }

    active.classList.remove("active");
    menuArr[idx].classList.add("active");
    menuArr[idx].focus();
  }

  document.addEventListener("keydown", sidebarKeyListener);

  /**
   * Captura clicks/touches en sidebar y footer
   */
  [...menuItems, ...footerMenuItems].forEach(item => {
    item.addEventListener("click", () => {
      // actualizar activo
      menuItems.forEach(m => m.classList.remove("active"));
      footerMenuItems.forEach(m => m.classList.remove("active"));
      item.classList.add("active");
      // cargar
      loadSection(item.dataset.section);
    });
  });

  /**
   * Evento genérico para volver al sidebar desde cualquier sección
   */
  window.addEventListener("return-to-sidebar", () => {
    // reactivar listener
    document.removeEventListener("keydown", sidebarKeyListener);
    document.addEventListener("keydown", sidebarKeyListener);
    currentFocus = "menu";
    // foco en elemento activo
    const active = document.querySelector(".sidebar .menu-item.active");
    if (active) active.focus();
  });

  // inicial
  menuItems[0].classList.add("active");
  loadSection(menuItems[0].dataset.section);
  window.addEventListener("load", hideLoadingScreen);
});
