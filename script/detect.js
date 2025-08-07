function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const sw = window.screen.width;
  const sh = window.screen.height;
  const hasTouch = navigator.maxTouchPoints > 0;

  console.log("Detect:", { ua, sw, sh, hasTouch });

  // 1) Si pantalla muy ancha (>= 1280px) y no hay touch → TV
  if (Math.max(sw, sh) >= 1280 && !hasTouch) {
    return "android-tv";
  }
  // 2) Si hay touch → móvil/tablet
  if (hasTouch) {
    return "mobile";
  }
  // 3) Resto → desktop
  return "desktop";
}
window.detectDevice = detectDevice;
