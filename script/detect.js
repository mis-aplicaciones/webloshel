// script/detect.js

/**
 * detectDevice — devuelve la plataforma guardada por el usuario.
 * Si no hay nada guardado, retorna 'desktop' por defecto.
 */
function detectDevice() {
  const choice = localStorage.getItem("platformChoice");
  return choice ? choice : "desktop";
}

window.detectDevice = detectDevice;
