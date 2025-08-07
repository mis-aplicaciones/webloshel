// script/detect.js

function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  const isiOS    = /iphone|ipad|ipod/.test(ua);
  const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;

  // 1) Si es Android **sin** pantalla táctil → TV
  if (isAndroid && !hasTouch) {
    return "android-tv";
  }
  // 2) Si es Android con touch, o iOS → móvil/tablet
  if ((isAndroid && hasTouch) || isiOS) {
    return "mobile";
  }
  // 3) Si ninguna de las dos anteriores, pero la ventana es muy ancha:
  //    asume TV (muchas Android TV devuelven UA “Android” + “Mobile” por defecto)
  if (Math.max(window.innerWidth, window.innerHeight) >= 1200) {
    return "android-tv";
  }
  // 4) Si la ventana es pequeña y tiene touch → móvil
  if (hasTouch) {
    return "mobile";
  }
  // 5) Desktop (PC)
  return "desktop";
}

// En caso de que tras todo esto aún quieras dar al usuario la opción de elegir:
function askManualOverride(defaultDevice, callback) {
  const choice = confirm(
    `Detecté que estás en "${defaultDevice}".\n\n¿Quieres cambiar a Android TV?`
  );
  callback(choice ? "android-tv" : defaultDevice);
}

window.detectDevice = function() {
  const dev = detectDevice();
  // si quieres forzar pregunta en caso de ambigüedad:
  if (dev === "mobile" && window.innerWidth > 1000) {
    // Por ejemplo, en un tablet grande o un TV empaquetado
    askManualOverride(dev, final => (window.__detected = final));
    return window.__detected || dev;
  }
  return dev;
};
