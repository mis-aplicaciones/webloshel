function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua) && /\stv\;/.test(ua)) return 'android-tv';
    if (/android/.test(ua) || /iphone|ipad|ipod/.test(ua)) return 'mobile';
    return 'desktop';
  }
  
  // Exponer para index.html
  window.detectDevice = detectDevice;
  