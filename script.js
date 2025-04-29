// script.js
document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");

  const hideLoadingScreen = () => {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 500);
    }, 1000);
  };

  const menuItems = document.querySelectorAll(".menu-item");
  const footerMenuItems = document.querySelectorAll(".footer .menu-item");
  const content = document.querySelector(".content");

  let currentFocus = "menu";      // "menu" ó "content"
  let activeSection = "home.html";
  let currentScript = null;
  let sidebarKeyListener;

  // Carga y arranca el JS de cada sección
  const initializeSectionScripts = (section) => {
    // Al entrar en sección, dejamos el foco en contenido y deshabilitamos el listener de menú
    currentFocus = "content";
    document.removeEventListener("keydown", sidebarKeyListener);

    let scriptPath = "";
    let initializeFunction = "";

    switch (section) {
      case "home.html":
        scriptPath = "scripthome.js";
        initializeFunction = "initializeHome";
        break;
      case "movies.html":
        scriptPath = "scriptmovie.js";
        initializeFunction = "initializeMovie";
        break;
      case "series.html":
        scriptPath = "scriptserie.js";
        initializeFunction = "initializeSerie";
        break;
      case "tv.html":
        scriptPath = "scripttv.js";
        initializeFunction = "initializeTv";
        break;
      case "usuario.html":
        scriptPath = "scriptusuario.js";
        initializeFunction = "initializeUsuario";
        break;
      default:
        console.error(`Sección desconocida: ${section}`);
        return;
    }

    // Inyectamos y arrancamos el script
    const script = document.createElement("script");
    script.src = scriptPath;
    script.onload = () => {
      if (typeof window[initializeFunction] === "function") {
        window[initializeFunction]();
      } else {
        console.error(`Función ${initializeFunction} no encontrada en ${scriptPath}`);
      }
    };
    document.body.appendChild(script);
    currentScript = script;
  };

  const cleanupSection = () => {
    if (currentScript) {
      document.body.removeChild(currentScript);
      currentScript = null;
    }
  };

  const loadContent = (section) => {
    cleanupSection();
    fetch(section)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar la sección");
        return res.text();
      })
      .then((html) => {
        content.innerHTML = html;
        activeSection = section;
        updateFooterActiveState(section);
        initializeSectionScripts(section);
      })
      .catch((err) => {
        console.error(err);
        content.innerHTML = "<p>Error al cargar contenido.</p>";
      });
  };

  const updateFooterActiveState = (section) => {
    footerMenuItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.section === section);
    });
  };

  // *****************************************************************
  // Sidebar navigation: flechas y Enter (solo cuando currentFocus = "menu")
  // *****************************************************************
  sidebarKeyListener = (e) => {
    if (currentFocus !== "menu") return;

    const active = document.querySelector(".menu-item.active");
    const arr = Array.from(menuItems);
    let idx = arr.indexOf(active);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        idx = (idx + 1) % arr.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        idx = (idx - 1 + arr.length) % arr.length;
        break;
      case "Enter":
        const sec = active.getAttribute("data-section");
        loadContent(sec);
        return;
      default:
        return;
    }

    active.classList.remove("active");
    menuItems[idx].classList.add("active");
    menuItems[idx].focus();
  };
  document.addEventListener("keydown", sidebarKeyListener);

  // Click (o touch) en menu y footer
  [...menuItems, ...footerMenuItems].forEach((item) => {
    item.addEventListener("click", () => {
      menuItems.forEach((m) => m.classList.remove("active"));
      footerMenuItems.forEach((m) => m.classList.remove("active"));
      item.classList.add("active");
      loadContent(item.dataset.section);
    });
  });

  // Evento genérico para volver al sidebar desde cualquier sección
  window.addEventListener("return-to-sidebar", () => {
    // Limpieza de sección
    cleanupSection();

    // Reactivar listener de menú
    document.addEventListener("keydown", sidebarKeyListener);
    currentFocus = "menu";

    // Poner foco en el ítem activo
    const active = document.querySelector(".menu-item.active");
    if (active) active.focus();
  });

  // Estado inicial
  menuItems[0].classList.add("active");
  loadContent("home.html");

  window.addEventListener("load", () => {
    hideLoadingScreen();
  });
});
