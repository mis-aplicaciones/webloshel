// script.js
// Gestión global de la SPA: sidebar y carga de secciones dinámicas

document.addEventListener("DOMContentLoaded", () => {
  // Elementos fijos
  const loadingScreen   = document.getElementById("loading-screen");
  const menuItems       = Array.from(document.querySelectorAll(".sidebar .menu-item"));
  const footerMenuItems = Array.from(document.querySelectorAll(".footer .menu-item"));
  const content         = document.querySelector(".content");

  // Estado global
  let currentFocus   = "menu";          // "menu" o "content"
  let activeSection  = "home.html";
  let currentScript  = null;

  // Mostrar/ocultar pantalla de carga
  function hideLoadingScreen() {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 500);
    }, 1000);
  }

  // Carga y arranque de cada sección
  function initializeSectionScripts(section) {
    // Deshabilitar navegación del sidebar
    document.removeEventListener("keydown", sidebarKeyListener);
    currentFocus = "content";

    // Determinar ruta y función init
    let scriptPath = "";
    let initFn     = "";

    switch (section) {
      case "home.html":    scriptPath = "scripthome.js";  initFn = "initializeHome";    break;
      case "movies.html":  scriptPath = "scriptmovie.js"; initFn = "initializeMovie";  break;
      case "series.html":  scriptPath = "scriptserie.js"; initFn = "initializeSerie";  break;
      case "tv.html":      scriptPath = "scripttv.js";    initFn = "initializeTv";      break;
      case "usuario.html": scriptPath = "scriptusuario.js";initFn = "initializeUsuario";break;
      default:
        console.error(`Sección desconocida: ${section}`);
        return;
    }

    // Insertar y ejecutar
    const script = document.createElement("script");
    script.src = scriptPath;
    script.onload = () => {
      if (typeof window[initFn] === "function") {
        window[initFn]();
      } else {
        console.error(`Función ${initFn} no encontrada en ${scriptPath}`);
      }
    };
    document.body.appendChild(script);
    currentScript = script;
  }

  // Limpiar script anterior
  function cleanupSection() {
    if (currentScript) {
      document.body.removeChild(currentScript);
      currentScript = null;
    }
  }

  // Cargar HTML al content
  function loadContent(section) {
    cleanupSection();
    fetch(section)
      .then(res => {
        if (!res.ok) throw new Error("No se pudo cargar la sección");
        return res.text();
      })
      .then(html => {
        content.innerHTML = html;
        activeSection = section;
        updateFooterActiveState(section);
        initializeSectionScripts(section);
      })
      .catch(err => {
        console.error(err);
        content.innerHTML = '<p>Error al cargar contenido.</p>';
      });
  }

  // Marcar active en footer
  function updateFooterActiveState(section) {
    footerMenuItems.forEach(item => {
      item.classList.toggle("active", item.dataset.section === section);
    });
  }

  // ******************************************************************
  // Navegación del sidebar (solo mientras currentFocus == "menu")
  // ******************************************************************
  function sidebarKeyListener(e) {
    if (currentFocus !== "menu") return;
    const activeIndex = menuItems.findIndex(mi => mi.classList.contains("active"));
    let idx = activeIndex;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        idx = (activeIndex + 1) % menuItems.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        idx = (activeIndex - 1 + menuItems.length) % menuItems.length;
        break;
      case "Enter":
        e.preventDefault();
        const section = menuItems[activeIndex].dataset.section;
        loadContent(section);
        return;
      default:
        return;
    }

    menuItems[activeIndex].classList.remove("active");
    menuItems[idx].classList.add("active");
    menuItems[idx].focus();
  }
  document.addEventListener("keydown", sidebarKeyListener);

  // Click / touch en sidebar y footer
  [...menuItems, ...footerMenuItems].forEach(item => {
    item.addEventListener("click", () => {
      // Reset active
      menuItems.forEach(mi => mi.classList.remove("active"));
      footerMenuItems.forEach(fi => fi.classList.remove("active"));

      item.classList.add("active");
      loadContent(item.dataset.section);
    });
  });

  // ******************************************************************
  // Retorno desde sección: reactivar sidebar
  // ******************************************************************
  window.addEventListener("return-to-sidebar", () => {
    // Limpiar sección activa
    cleanupSection();

    // Reactivar listener de sidebar
    document.removeEventListener("keydown", sidebarKeyListener);
    document.addEventListener("keydown", sidebarKeyListener);
    currentFocus = "menu";

    // Focar elemento activo
    const active = document.querySelector(".sidebar .menu-item.active");
    if (active) active.focus();
  });

  // ******************************************************************
  // Inicialización global
  // ******************************************************************
  menuItems[0].classList.add("active");
  loadContent("home.html");
  window.addEventListener("load", hideLoadingScreen);
});
