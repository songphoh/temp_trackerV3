// public/js/performance-monitor.js - Performance Monitoring สำหรับ Mobile

class MobilePerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = new Map();
    this.isEnabled = true;
    this.reportInterval = 30000; // 30 seconds
    this.maxMetrics = 100; // Keep last 100 metrics
    
    this.init();
  }

  init() {
    if (!this.isEnabled) return;
    
    console.log('📊 Initializing Performance Monitor...');
    
    // Setup performance observers
    this.setupNavigationObserver();
    this.setupResourceObserver();
    this.setupLargestContentfulPaintObserver();
    this.setupFirstInputDelayObserver();
    this.setupLayoutShiftObserver();
    
    // Monitor custom metrics
    this.setupCustomMetrics();
    
    // Setup reporting
    this.setupReporting();
    
    // Monitor network conditions
    this.setupNetworkMonitoring();
    
    // Monitor memory usage
    this.setupMemoryMonitoring();
    
    // Monitor frame rate
    this.setupFrameRateMonitoring();
  }

  // ⭐ Core Web Vitals Monitoring
  setupNavigationObserver() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            this.recordMetric('navigation', {
              type: entry.type,
              startTime: entry.startTime,
              duration: entry.duration,
              domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
              loadComplete: entry.loadEventEnd - entry.loadEventStart,
              timestamp: Date.now()
            });
          }
        });
        
        observer.observe({ entryTypes: ['navigation'] });
        this.observers.set('navigation', observer);
        
      } catch (error) {
        console.warn('📊 Navigation observer not supported:', error);
      }
    }
  }

  setupResourceObserver() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            // Only track important resources
            if (this.isImportantResource(entry.name)) {
              this.recordMetric('resource', {
                name: entry.name,
                type: entry.initiatorType,
                duration: entry.duration,
                transferSize: entry.transferSize,
                encodedBodySize: entry.encodedBodySize,
                decodedBodySize: entry.decodedBodySize,
                timestamp: Date.now()
              });
            }
          }
        });
        
        observer.observe({ entryTypes: ['resource'] });
        this.observers.set('resource', observer);
        
      } catch (error) {
        console.warn('📊 Resource observer not supported:', error);
      }
    }
  }

  setupLargestContentfulPaintObserver() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          
          this.recordMetric('lcp', {
            value: lastEntry.startTime,
            element: lastEntry.element?.tagName || 'unknown',
            url: lastEntry.url || '',
            timestamp: Date.now()
          });
          
          // Report LCP for analytics
          this.reportCoreWebVital('LCP', lastEntry.startTime);
        });
        
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.set('lcp', observer);
        
      } catch (error) {
        console.warn('📊 LCP observer not supported:', error);
      }
    }
  }

  setupFirstInputDelayObserver() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            this.recordMetric('fid', {
              value: entry.processingStart - entry.startTime,
              eventType: entry.name,
              timestamp: Date.now()
            });
            
            // Report FID for analytics
            this.reportCoreWebVital('FID', entry.processingStart - entry.startTime);
          }
        });
        
        observer.observe({ entryTypes: ['first-input'] });
        this.observers.set('fid', observer);
        
      } catch (error) {
        console.warn('📊 FID observer not supported:', error);
      }
    }
  }

  setupLayoutShiftObserver() {
    if ('PerformanceObserver' in window) {
      try {
        let clsValue = 0;
        let sessionValue = 0;
        let sessionEntries = [];
        
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            // Only count unexpected layout shifts
            if (!entry.hadRecentInput) {
              const firstSessionEntry = sessionEntries[0];
              const lastSessionEntry = sessionEntries[sessionEntries.length - 1];
              
              // If the entry occurred within 1 second of the previous entry and
              // within 5 seconds of the first entry in the session, include it
              if (sessionValue &&
                  entry.startTime - lastSessionEntry.startTime < 1000 &&
                  entry.startTime - firstSessionEntry.startTime < 5000) {
                sessionValue += entry.value;
                sessionEntries.push(entry);
              } else {
                sessionValue = entry.value;
                sessionEntries = [entry];
              }
              
              // Update CLS if this session value is larger
              if (sessionValue > clsValue) {
                clsValue = sessionValue;
                
                this.recordMetric('cls', {
                  value: clsValue,
                  sessionValue: sessionValue,
                  timestamp: Date.now()
                });
                
                // Report CLS for analytics
                this.reportCoreWebVital('CLS', clsValue);
              }
            }
          }
        });
        
        observer.observe({ entryTypes: ['layout-shift'] });
        this.observers.set('cls', observer);
        
      } catch (error) {
        console.warn('📊 CLS observer not supported:', error);
      }
    }
  }

  // ⭐ Custom Metrics
  setupCustomMetrics() {
    // API Response Time
    this.monitorAPIPerformance();
    
    // UI Interaction Time
    this.monitorUIInteractions();
    
    // Service Worker Performance
    this.monitorServiceWorkerPerformance();
    
    // App-specific metrics
    this.monitorAppMetrics();
  }

  monitorAPIPerformance() {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0];
      
      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Only track mobile API calls
        if (typeof url === 'string' && url.includes('/api/')) {
          this.recordMetric('api_performance', {
            url: url.replace(/^.*\/api/, '/api'),
            method: args[1]?.method || 'GET',
            status: response.status,
            duration: duration,
            cached: response.headers.get('X-Cache') === 'HIT',
            timestamp: Date.now()
          });
          
          // Alert on slow APIs
          if (duration > 2000) {
            console.warn(`📊 Slow API detected: ${url} took ${duration.toFixed(2)}ms`);
          }
        }
        
        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        this.recordMetric('api_error', {
          url: typeof url === 'string' ? url.replace(/^.*\/api/, '/api') : 'unknown',
          method: args[1]?.method || 'GET',
          error: error.message,
          duration: duration,
          timestamp: Date.now()
        });
        
        throw error;
      }
    };
  }

  monitorUIInteractions() {
    // Track button clicks and form submissions
    document.addEventListener('click', (e) => {
      if (e.target.matches('button, .btn, input[type="submit"]')) {
        const startTime = performance.now();
        
        // Measure time to next paint
        requestAnimationFrame(() => {
          const duration = performance.now() - startTime;
          
          this.recordMetric('ui_interaction', {
            type: 'click',
            element: e.target.tagName.toLowerCase(),
            id: e.target.id || '',
            className: e.target.className || '',
            duration: duration,
            timestamp: Date.now()
          });
        });
      }
    });
    
    // Track form submissions
    document.addEventListener('submit', (e) => {
      const startTime = performance.now();
      
      this.recordMetric('form_submit', {
        formId: e.target.id || '',
        elements: e.target.elements.length,
        timestamp: Date.now()
      });
    });
  }

  monitorServiceWorkerPerformance() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_HIT') {
          this.recordMetric('sw_cache_hit', {
            url: event.data.url,
            cacheType: event.data.cacheType,
            timestamp: Date.now()
          });
        }
      });
    }
  }

  monitorAppMetrics() {
    // Clock in/out success rate
    window.addEventListener('clock-action', (e) => {
      this.recordMetric('clock_action', {
        type: e.detail.type,
        success: e.detail.success,
        duration: e.detail.duration,
        offline: e.detail.offline,
        timestamp: Date.now()
      });
    });
    
    // Employee selection time
    window.addEventListener('employee-selected', (e) => {
      this.recordMetric('employee_selection', {
        selectionTime: e.detail.selectionTime,
        method: e.detail.method, // 'type' or 'click'
        timestamp: Date.now()
      });
    });
  }

  // ⭐ Network Monitoring
  setupNetworkMonitoring() {
    // Monitor connection type
    if ('connection' in navigator) {
      const updateConnectionInfo = () => {
        const connection = navigator.connection;
        this.recordMetric('network', {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
          timestamp: Date.now()
        });
      };
      
      // Initial measurement
      updateConnectionInfo();
      
      // Listen for changes
      navigator.connection.addEventListener('change', updateConnectionInfo);
    }
    
    // Monitor online/offline
    const recordConnectionStatus = (online) => {
      this.recordMetric('connection_status', {
        online: online,
        timestamp: Date.now()
      });
    };
    
    window.addEventListener('online', () => recordConnectionStatus(true));
    window.addEventListener('offline', () => recordConnectionStatus(false));
  }

  // ⭐ Memory Monitoring
  setupMemoryMonitoring() {
    if ('memory' in performance) {
      const measureMemory = () => {
        const memory = performance.memory;
        this.recordMetric('memory', {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        });
        
        // Alert on high memory usage
        const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        if (usagePercent > 80) {
          console.warn(`📊 High memory usage: ${usagePercent.toFixed(1)}%`);
        }
      };
      
      // Measure every 10 seconds
      setInterval(measureMemory, 10000);
    }
  }

  // ⭐ Frame Rate Monitoring
  setupFrameRateMonitoring() {
    let frames = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frames++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastTime));
        
        this.recordMetric('fps', {
          value: fps,
          timestamp: Date.now()
        });
        
        // Alert on low FPS
        if (fps < 30) {
          console.warn(`📊 Low FPS detected: ${fps}`);
        }
        
        frames = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  // ⭐ Reporting
  setupReporting() {
    // Periodic reporting
    setInterval(() => {
      this.generateReport();
    }, this.reportInterval);
    
    // Report on page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.generateReport();
      }
    });
    
    // Report on page unload
    window.addEventListener('beforeunload', () => {
      this.generateReport();
    });
  }

  recordMetric(type, data) {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }
    
    const metrics = this.metrics.get(type);
    metrics.push(data);
    
    // Keep only recent metrics
    if (metrics.length > this.maxMetrics) {
      metrics.shift();
    }
    
    // Debug logging
    if (this.isDebugMode()) {
      console.log(`📊 Metric recorded: ${type}`, data);
    }
  }

  reportCoreWebVital(name, value) {
    // Report to Google Analytics if available
    if (typeof gtag !== 'undefined') {
      gtag('event', name, {
        event_category: 'Web Vitals',
        value: Math.round(value),
        custom_parameter_1: this.getDeviceInfo()
      });
    }
    
    // Report to console in debug mode
    if (this.isDebugMode()) {
      console.log(`📊 Core Web Vital - ${name}: ${value.toFixed(2)}ms`);
    }
  }

  generateReport() {
    const report = {
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      device: this.getDeviceInfo(),
      metrics: this.getMetricsSummary()
    };
    
    // Send to Service Worker for potential upload
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PERFORMANCE_REPORT',
        metrics: report
      });
    }
    
    // Store locally for debugging
    this.storeReportLocally(report);
    
    if (this.isDebugMode()) {
      console.log('📊 Performance Report Generated:', report);
    }
  }

  getMetricsSummary() {
    const summary = {};
    
    for (const [type, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;
      
      const recent = metrics.slice(-10); // Last 10 metrics
      
      if (type === 'api_performance') {
        summary[type] = {
          count: recent.length,
          avgDuration: this.average(recent.map(m => m.duration)),
          slowRequests: recent.filter(m => m.duration > 1000).length,
          errorRate: 0 // Calculate from api_error metrics
        };
      } else if (type === 'memory') {
        const latest = recent[recent.length - 1];
        summary[type] = {
          usedMB: Math.round(latest.usedJSHeapSize / 1024 / 1024),
          totalMB: Math.round(latest.totalJSHeapSize / 1024 / 1024),
          usagePercent: Math.round((latest.usedJSHeapSize / latest.jsHeapSizeLimit) * 100)
        };
      } else if (type === 'fps') {
        summary[type] = {
          average: this.average(recent.map(m => m.value)),
          minimum: Math.min(...recent.map(m => m.value)),
          samples: recent.length
        };
      } else {
        summary[type] = {
          count: recent.length,
          latest: recent[recent.length - 1]
        };
      }
    }
    
    return summary;
  }

  storeReportLocally(report) {
    try {
      const reports = JSON.parse(localStorage.getItem('performance_reports') || '[]');
      reports.push(report);
      
      // Keep only last 10 reports
      if (reports.length > 10) {
        reports.shift();
      }
      
      localStorage.setItem('performance_reports', JSON.stringify(reports));
    } catch (error) {
      console.warn('📊 Failed to store performance report locally:', error);
    }
  }

  // ⭐ Helper Methods
  isImportantResource(name) {
    const importantTypes = ['.js', '.css', '.html', '/api/'];
    return importantTypes.some(type => name.includes(type));
  }

  getDeviceInfo() {
    return {
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      platform: navigator.platform,
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      touch: 'ontouchstart' in window
    };
  }

  average(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  isDebugMode() {
    return localStorage.getItem('debug-mode') === 'true' || 
           window.location.search.includes('debug=true');
  }

  // ⭐ Public API
  getMetrics(type) {
    return this.metrics.get(type) || [];
  }

  getLatestReport() {
    try {
      const reports = JSON.parse(localStorage.getItem('performance_reports') || '[]');
      return reports[reports.length - 1] || null;
    } catch (error) {
      return null;
    }
  }

  getAllReports() {
    try {
      return JSON.parse(localStorage.getItem('performance_reports') || '[]');
    } catch (error) {
      return [];
    }
  }

  clearReports() {
    localStorage.removeItem('performance_reports');
    this.metrics.clear();
  }

  // Start monitoring specific metric
  startMonitoring(type) {
    console.log(`📊 Started monitoring: ${type}`);
  }

  // Stop monitoring specific metric
  stopMonitoring(type) {
    if (this.observers.has(type)) {
      this.observers.get(type).disconnect();
      this.observers.delete(type);
      console.log(`📊 Stopped monitoring: ${type}`);
    }
  }

  // Get current performance score
  getPerformanceScore() {
    const lcp = this.getMetrics('lcp');
    const fid = this.getMetrics('fid');
    const cls = this.getMetrics('cls');
    
    if (lcp.length === 0 && fid.length === 0 && cls.length === 0) {
      return null;
    }
    
    let score = 100;
    
    // LCP scoring (target < 2.5s)
    if (lcp.length > 0) {
      const latestLCP = lcp[lcp.length - 1].value;
      if (latestLCP > 4000) score -= 30;
      else if (latestLCP > 2500) score -= 15;
    }
    
    // FID scoring (target < 100ms)
    if (fid.length > 0) {
      const latestFID = fid[fid.length - 1].value;
      if (latestFID > 300) score -= 30;
      else if (latestFID > 100) score -= 15;
    }
    
    // CLS scoring (target < 0.1)
    if (cls.length > 0) {
      const latestCLS = cls[cls.length - 1].value;
      if (latestCLS > 0.25) score -= 30;
      else if (latestCLS > 0.1) score -= 15;
    }
    
    return Math.max(0, score);
  }

  // Export data for analysis
  exportData() {
    const data = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      device: this.getDeviceInfo(),
      metrics: Object.fromEntries(this.metrics),
      reports: this.getAllReports(),
      score: this.getPerformanceScore()
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📊 Performance data exported');
  }
}

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
  window.MobilePerformanceMonitor = MobilePerformanceMonitor;
  
  // Create global instance
  window.addEventListener('load', () => {
    if (!window.perfMonitor) {
      window.perfMonitor = new MobilePerformanceMonitor();
    }
  });
}