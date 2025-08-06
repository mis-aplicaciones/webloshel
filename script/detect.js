// script/detect.js

function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();

  // 1) Android TV → “android” sin “mobile”
  if (ua.includes("android") && !ua.includes("mobile")) {
    return "android-tv";
  }

  // 2) Android Móvil o iOS → “android” con “mobile” o iOS
  if (
    (ua.includes("android") && ua.includes("mobile")) ||
    /iphone|ipad|ipod/.test(ua)
  ) {
    return "mobile";
  }

  // 3) Cualquier otro → Desktop
  return "desktop";
}

window.detectDevice = detectDevice;
