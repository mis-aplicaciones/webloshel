// detect.js

function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    const isTvUA = ua.includes("smart-tv")
                 || ua.includes("googletv")
                 || ua.includes("hbbtv")
                 || ua.includes("androidtv");
    const isAndroid = ua.includes("android");
    const isiOS     = /iphone|ipad|ipod/.test(ua);
    const isMobile  = isAndroid || isiOS;
    if (isTvUA || (isAndroid && window.innerWidth >= 960 && !("ontouchstart" in window))) {
      return "android-tv";
    }
    if (isMobile) {
      return "mobile";
    }
    return "desktop";
  }
  
  window.detectDevice = detectDevice;
  