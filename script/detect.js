// script/detect.js

function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  // Detectamos si hay pantalla táctil
  const hasTouch =
    ("ontouchstart" in window) ||
    (navigator.maxTouchPoints || 0) > 0;

  // 1) Android sin touch → Android TV
  if (isAndroid && !hasTouch) {
    return "android-tv";
  }
  // 2) Android con touch, o iOS → móvil/tablet
  if (
    (isAndroid && hasTouch) ||
    /iphone|ipad|ipod/.test(ua)
  ) {
    return "mobile";
  }
  // 3) Resto → desktop
  return "desktop";
}

window.detectDevice = detectDevice;

window.detectDevice = detectDevice;

