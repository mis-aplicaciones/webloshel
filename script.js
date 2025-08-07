document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen   = document.getElementById("loading-screen");
  const menuItems       = Array.from(document.querySelectorAll(".sidebar .menu-item"));
  const footerMenuItems = Array.from(document.querySelectorAll(".footer .menu-item"));
  const content         = document.querySelector(".content");

  let currentFocus  = "menu";      // "menu" o "content"
  let activeSection = "home.html";
  let currentScript = null;

  function hideLoadingScreen() {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      setTimeout(() => loadingScreen.style.display = "none", 500);
    }, 1000);
  }

  function loadContent(section) {
    cleanupSection();
    fetch(section).then(res => {
      if (!res.ok) throw new Error();
      return res.text();
    }).then(html => {
      content.innerHTML = html;
      activeSection = section;
      updateFooterActiveState(section);
      initializeSectionScripts(section);
    }).catch(() => {
      content.innerHTML = '<p>Error al cargar contenido.</p>';
    });
  }

  function updateFooterActiveState(section) {
    footerMenuItems.forEach(fi => {
      fi.classList.toggle("active", fi.dataset.section === section);
    });
  }

  function initializeSectionScripts(section) {
    document.removeEventListener("keydown", sidebarKeyListener);
    currentFocus = "content";

    let scriptPath, initFn;
    switch (section) {
      case "home.html":    scriptPath="scripthome.js";    initFn="initializeHome";    break;
      case "movies.html":  scriptPath="scriptmovie.js";   initFn="initializeMovie";   break;
      case "series.html":  scriptPath="scriptserie.js";   initFn="initializeSerie";   break;
      case "tv.html":      scriptPath="scripttv.js";      initFn="initializeTv";      break;
      case "usuario.html": scriptPath="scriptusuario.js"; initFn="initializeUsuario"; break;
      default: console.error("Sección desconocida", section); return;
    }

    const script = document.createElement("script");
    script.src = scriptPath;
    script.onload = () => {
      if (typeof window[initFn]==="function") window[initFn]();
      else console.error(`No se encontró ${initFn} en ${scriptPath}`);
    };
    document.body.appendChild(script);
    currentScript = script;
  }

  function cleanupSection() {
    if (currentScript) {
      document.body.removeChild(currentScript);
      currentScript = null;
    }
  }

  // ********** Sidebar navigation **********
  function sidebarKeyListener(e) {
    if (currentFocus !== "menu") return;

    const focusedIndex = menuItems.findIndex(mi=> mi === document.activeElement);
    let nextIndex = focusedIndex;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        nextIndex = (focusedIndex + 1) % menuItems.length;
        menuItems[nextIndex].focus();
        return;
      case "ArrowUp":
        e.preventDefault();
        nextIndex = (focusedIndex - 1 + menuItems.length) % menuItems.length;
        menuItems[nextIndex].focus();
        return;
      case "Enter":
        e.preventDefault();
        // Al ejecutar, movemos la franja ::before y cargamos
        menuItems.forEach(mi=>mi.classList.remove("active"));
        footerMenuItems.forEach(fi=>fi.classList.remove("active"));
        document.activeElement.classList.add("active");
        loadContent(document.activeElement.dataset.section);
        return;
      default:
        return;
    }
  }
  document.addEventListener("keydown", sidebarKeyListener);

  // Click/touch en sidebar items
  menuItems.forEach(mi=>{
    mi.addEventListener("click", ()=>{
      menuItems.forEach(x=>x.classList.remove("active"));
      footerMenuItems.forEach(x=>x.classList.remove("active"));
      mi.classList.add("active");
      loadContent(mi.dataset.section);
    });
  });

  // Click/touch en footer
  footerMenuItems.forEach(fi=>{
    fi.addEventListener("click", ()=>{
      menuItems.forEach(x=>x.classList.remove("active"));
      footerMenuItems.forEach(x=>x.classList.remove("active"));
      fi.classList.add("active");
      loadContent(fi.dataset.section);
    });
  });

  // Evento de retorno al sidebar
  window.addEventListener("return-to-sidebar", () => {
    cleanupSection();
    currentFocus = "menu";
    document.addEventListener("keydown", sidebarKeyListener);
    const active = document.querySelector(".sidebar .menu-item.active");
    if (active) active.focus();
  });

  // Init
  menuItems[0].classList.add("active");
  menuItems[0].focus();
  loadContent("home.html");
  window.addEventListener("load", hideLoadingScreen);
});
