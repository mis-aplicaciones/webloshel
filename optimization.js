// optimization.js - Optimizaciones para mejorar la fluidez y rendimiento

(() => {
  'use strict';

  // Cache para imágenes precargadas
  const imageCache = new Map();
  const preloadQueue = [];
  let isPreloading = false;

  // Configuración de optimización
  const OPTIMIZATION_CONFIG = {
    MAX_CONCURRENT_LOADS: 3,
    PRELOAD_DELAY: 100,
    IMAGE_QUALITY_THRESHOLD: 0.8,
    LAZY_LOAD_THRESHOLD: 200
  };

  /**
   * Precarga imágenes de forma optimizada
   */
  function preloadImage(url, priority = 'low') {
    return new Promise((resolve, reject) => {
      if (imageCache.has(url)) {
        resolve(imageCache.get(url));
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.loading = priority === 'high' ? 'eager' : 'lazy';
      
      img.onload = () => {
        imageCache.set(url, img);
        resolve(img);
      };
      
      img.onerror = () => {
        console.warn(`Failed to preload image: ${url}`);
        reject(new Error(`Failed to load ${url}`));
      };
      
      img.src = url;
    });
  }

  /**
   * Procesa la cola de precarga de forma controlada
   */
  async function processPreloadQueue() {
    if (isPreloading || preloadQueue.length === 0) return;
    
    isPreloading = true;
    const batch = preloadQueue.splice(0, OPTIMIZATION_CONFIG.MAX_CONCURRENT_LOADS);
    
    try {
      await Promise.allSettled(
        batch.map(({ url, priority }) => preloadImage(url, priority))
      );
    } catch (error) {
      console.warn('Error in preload batch:', error);
    }
    
    isPreloading = false;
    
    // Procesar siguiente lote si hay más elementos
    if (preloadQueue.length > 0) {
      setTimeout(processPreloadQueue, OPTIMIZATION_CONFIG.PRELOAD_DELAY);
    }
  }

  /**
   * Agrega imagen a la cola de precarga
   */
  function queueImagePreload(url, priority = 'low') {
    if (!url || imageCache.has(url)) return;
    
    preloadQueue.push({ url, priority });
    processPreloadQueue();
  }

  /**
   * Optimiza la carga de la base de datos JSON
   */
  async function loadDatabaseOptimized(urls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            signal: controller.signal,
            cache: 'force-cache',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'max-age=3600'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            clearTimeout(timeoutId);
            return data;
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            throw new Error('Database load timeout');
          }
          console.warn(`Failed to load from ${url}:`, error);
        }
      }
      throw new Error('All database URLs failed');
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Optimiza el renderizado de elementos del DOM
   */
  function optimizeDOMRendering() {
    // Usar requestAnimationFrame para operaciones DOM pesadas
    const rafQueue = [];
    let isProcessing = false;

    function processRAFQueue() {
      if (isProcessing || rafQueue.length === 0) return;
      
      isProcessing = true;
      const batch = rafQueue.splice(0, 10); // Procesar máximo 10 elementos por frame
      
      batch.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.warn('Error in RAF callback:', error);
        }
      });
      
      isProcessing = false;
      
      if (rafQueue.length > 0) {
        requestAnimationFrame(processRAFQueue);
      }
    }

    return {
      schedule: (callback) => {
        rafQueue.push(callback);
        if (!isProcessing) {
          requestAnimationFrame(processRAFQueue);
        }
      }
    };
  }

  /**
   * Optimiza el scroll y las animaciones
   */
  function optimizeScrollPerformance() {
    let ticking = false;
    
    function updateScrollElements() {
      // Aquí se pueden agregar optimizaciones específicas de scroll
      ticking = false;
    }
    
    function requestScrollUpdate() {
      if (!ticking) {
        requestAnimationFrame(updateScrollElements);
        ticking = true;
      }
    }
    
    // Throttle scroll events
    document.addEventListener('scroll', requestScrollUpdate, { passive: true });
    document.addEventListener('touchmove', requestScrollUpdate, { passive: true });
  }

  /**
   * Optimiza la carga de texturas e imágenes de fondo
   */
  function optimizeBackgroundImages() {
    const backgroundElements = document.querySelectorAll('[style*="background-image"]');
    
    backgroundElements.forEach(element => {
      const style = element.style.backgroundImage;
      const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
      
      if (urlMatch) {
        const imageUrl = urlMatch[1];
        queueImagePreload(imageUrl, 'medium');
      }
    });
  }

  /**
   * Inicializa todas las optimizaciones
   */
  function initializeOptimizations() {
    // Optimizar renderizado DOM
    const domOptimizer = optimizeDOMRendering();
    
    // Optimizar scroll
    optimizeScrollPerformance();
    
    // Optimizar imágenes de fondo
    optimizeBackgroundImages();
    
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
        rootMargin: `${OPTIMIZATION_CONFIG.LAZY_LOAD_THRESHOLD}px`
      });
      
      // Observar imágenes con lazy loading
      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
    
    return {
      domOptimizer,
      queueImagePreload,
      loadDatabaseOptimized
    };
  }

  // Exponer funciones globalmente
  window.OptimizationUtils = {
    initialize: initializeOptimizations,
    preloadImage,
    queueImagePreload,
    loadDatabaseOptimized
  };

  // Auto-inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOptimizations);
  } else {
    initializeOptimizations();
  }

})();
