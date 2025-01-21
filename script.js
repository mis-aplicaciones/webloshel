document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");

  const hideLoadingScreen = () => {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 500); // Tiempo suficiente para la transición
    }, 1000); // Retraso adicional para garantizar la estabilidad
  };

  const initializeApplication = () => {
    // Tu lógica de inicialización
    const menuItems = document.querySelectorAll(".menu-item");
    const content = document.querySelector(".content");
    const footerMenuItems = document.querySelectorAll(".footer .menu-item");

  let currentFocus = "content"; // Start focus on the content
  let activeSection = "home.html";
  let currentScript = null;

  const initializeSectionScripts = (section) => {
    let scriptPath = "";
    let initializeFunction = null;

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

    const script = document.createElement("script");
    script.src = scriptPath;
    script.onload = () => {
      if (typeof window[initializeFunction] === "function") {
        window[initializeFunction]();
      } else {
        console.error(`La función ${initializeFunction} no está definida en ${scriptPath}`);
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
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar la sección");
        return response.text();
      })
      .then((html) => {
        content.innerHTML = html;
        initializeSectionScripts(section);
        activeSection = section;
        updateFooterActiveState(section);
      })
      .catch((error) => {
        console.error(error);
        content.innerHTML = "<p>Error al cargar el contenido</p>";
      });
  };

  const updateFooterActiveState = (section) => {
    footerMenuItems.forEach((item) => {
      if (item.getAttribute("data-section") === section) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  };

  // Key navigation for sidebar
  document.addEventListener("keydown", (e) => {
    const activeMenuItem = document.querySelector(".menu-item.active");
    const menuItemsArray = Array.from(menuItems);

    if (currentFocus === "menu") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          (menuItemsArray.indexOf(activeMenuItem) + 1) % menuItemsArray.length;
        activeMenuItem.classList.remove("active");
        menuItems[nextIndex].classList.add("active");
        menuItems[nextIndex].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          (menuItemsArray.indexOf(activeMenuItem) - 1 + menuItemsArray.length) %
          menuItemsArray.length;
        activeMenuItem.classList.remove("active");
        menuItems[prevIndex].classList.add("active");
        menuItems[prevIndex].focus();
      } else if (e.key === "Enter") {
        const section = activeMenuItem.getAttribute("data-section");
        loadContent(section);
        currentFocus = "content";
      }
    } else if (currentFocus === "content") {
      if (e.key === "Backspace" || e.key === "Escape") {
        currentFocus = "menu";
        activeMenuItem.focus();
      }
    }
  });

  // Click events for sidebar and footer
  [...menuItems, ...footerMenuItems].forEach((item) => {
    item.addEventListener("click", () => {
      menuItems.forEach((menuItem) => menuItem.classList.remove("active"));
      footerMenuItems.forEach((menuItem) => menuItem.classList.remove("active"));

      item.classList.add("active");
      const section = item.getAttribute("data-section");
      loadContent(section);
      currentFocus = "content";
    });
  });

  // Initial focus and footer state
  menuItems[0].classList.add("active");
  loadContent("home.html");
};
// Escuchar el evento `load` para asegurarnos de que todo está listo
window.addEventListener("load", () => {
  hideLoadingScreen();
  initializeApplication();
});
});