// preload-config.js - Configuración de precarga de recursos críticos

(() => {
  'use strict';

  // Recursos críticos para precargar
  const CRITICAL_RESOURCES = {
    // Fuentes críticas
    fonts: [
      'https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;700&display=swap',
      'https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css'
    ],
    
    // Iconos críticos
    icons: [
      'https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js'
    ],
    
    // Imágenes del logo y elementos UI
    images: [
      'img/logo001.png'
    ]
  };

  // Configuración de precarga
  const PRELOAD_CONFIG = {
    // Prioridades de carga
    priorities: {
      fonts: 'high',
      icons: 'medium', 
      images: 'high'
    },
    
    // Timeouts para cada tipo de recurso
    timeouts: {
      fonts: 5000,
      icons: 3000,
      images: 4000
    }
  };

  /**
   * Precarga recursos críticos
   */
  function preloadCriticalResources() {
    // Precargar fuentes
    CRITICAL_RESOURCES.fonts.forEach(fontUrl => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = fontUrl;
      link.onload = () => {
        link.rel = 'stylesheet';
      };
      document.head.appendChild(link);
    });

    // Precargar iconos
    CRITICAL_RESOURCES.icons.forEach(iconUrl => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = iconUrl;
      document.head.appendChild(link);
    });

    // Precargar imágenes críticas
    CRITICAL_RESOURCES.images.forEach(imageUrl => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = imageUrl;
      document.head.appendChild(link);
    });
  }

  /**
   * Configura optimizaciones de rendimiento
   */
  function configurePerformanceOptimizations() {
    // Configurar meta tags para optimización
    const metaTags = [
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
      { name: 'theme-color', content: '#121124' },
      { name: 'color-scheme', content: 'dark' },
      { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge' }
    ];

    metaTags.forEach(tag => {
      const meta = document.createElement('meta');
      Object.keys(tag).forEach(key => {
        meta.setAttribute(key, tag[key]);
      });
      document.head.appendChild(meta);
    });

    // Configurar DNS prefetch para recursos externos
    const dnsPrefetchDomains = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.jsdelivr.net',
      'unpkg.com'
    ];

    dnsPrefetchDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });
  }

  /**
   * Configura lazy loading para imágenes no críticas
   */
  function configureLazyLoading() {
    // Configurar Intersection Observer para lazy loading
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          }
        });
      }, {
        rootMargin: '50px 0px',
        threshold: 0.01
      });

      // Observar imágenes con lazy loading
      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  /**
   * Optimiza el rendimiento del scroll
   */
  function optimizeScrollPerformance() {
    // Usar passive listeners para mejor rendimiento
    const passiveEvents = ['scroll', 'touchstart', 'touchmove', 'wheel'];
    
    passiveEvents.forEach(eventType => {
      document.addEventListener(eventType, () => {}, { passive: true });
    });

    // Optimizar el scroll del carousel
    const carousel = document.getElementById('carousel');
    if (carousel) {
      carousel.style.willChange = 'scroll-position';
      carousel.style.transform = 'translateZ(0)';
    }
  }

  /**
   * Inicializa todas las optimizaciones
   */
  function initializePreloadOptimizations() {
    // Configurar optimizaciones de rendimiento
    configurePerformanceOptimizations();
    
    // Precargar recursos críticos
    preloadCriticalResources();
    
    // Configurar lazy loading
    configureLazyLoading();
    
    // Optimizar scroll
    optimizeScrollPerformance();
    
    console.log('Preload optimizations initialized');
  }

  // Auto-inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePreloadOptimizations);
  } else {
    initializePreloadOptimizations();
  }

  // Exponer funciones globalmente
  window.PreloadConfig = {
    initialize: initializePreloadOptimizations,
    preloadCriticalResources,
    configurePerformanceOptimizations
  };

})();
