// public/js/mobile-core.js - Core Functions สำหรับ Mobile

// ⭐ Smart API Client with Caching
class MobileAPIClient {
  constructor() {
    this.baseURL = '/api/mobile';
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.retryCount = 3;
    this.timeout = 10000;
  }

  // Generic API call with smart caching
  async call(endpoint, options = {}) {
    const cacheKey = `${endpoint}:${JSON.stringify(options.body || {})}`;
    
    try {
      // Check cache first for GET requests
      if (!options.method || options.method === 'GET') {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          console.log('📱 API Cache hit:', endpoint);
          return cached;
        }
      }
      
      // Deduplicate identical requests
      if (this.pendingRequests.has(cacheKey)) {
        console.log('📱 API Request deduplication:', endpoint);
        return await this.pendingRequests.get(cacheKey);
      }
      
      // Make the actual request
      const requestPromise = this.makeRequest(endpoint, options);
      this.pendingRequests.set(cacheKey, requestPromise);
      
      const result = await requestPromise;
      this.pendingRequests.delete(cacheKey);
      
      // Cache successful GET responses
      if ((!options.method || options.method === 'GET') && result.success) {
        this.setCache(cacheKey, result, options.cacheTTL || 30000);
      }
      
      return result;
      
    } catch (error) {
      this.pendingRequests.delete(cacheKey);
      throw error;
    }
  }

  // Make HTTP request with retry logic
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Mobile-Client': 'true'
      },
      timeout: this.timeout,
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        console.log(`📱 API Request (attempt ${attempt}):`, endpoint);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);
        
        const response = await fetch(url, {
          ...config,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📱 API Success (${response.status}):`, endpoint);
        
        return data;
        
      } catch (error) {
        console.warn(`📱 API Attempt ${attempt} failed:`, endpoint, error.message);
        
        if (attempt === this.retryCount) {
          console.error(`📱 API Failed after ${this.retryCount} attempts:`, endpoint);
          throw new Error(`การเชื่อมต่อล้มเหลว: ${error.message}`);
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  // Cache management
  setCache(key, data, ttl = 30000) {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  clearCache() {
    this.cache.clear();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ⭐ Employee Management
class EmployeeManager {
  constructor(apiClient) {
    this.api = apiClient;
    this.employees = [];
    this.lastSync = 0;
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
  }

  async getEmployees(forceRefresh = false) {
    if (!forceRefresh && this.isCacheValid()) {
      return this.employees;
    }

    try {
      const response = await this.api.call('/employees', {
        cacheTTL: this.syncInterval
      });
      
      if (response.success) {
        this.employees = response.employees || [];
        this.lastSync = Date.now();
        console.log(`📱 Loaded ${this.employees.length} employees`);
      }
      
      return this.employees;
      
    } catch (error) {
      console.error('📱 Failed to load employees:', error);
      // Return cached data if available
      return this.employees;
    }
  }

  searchEmployees(query) {
    if (!query || query.length < 2) return this.employees;
    
    const lowerQuery = query.toLowerCase();
    return this.employees.filter(emp => 
      emp.name.toLowerCase().includes(lowerQuery) ||
      emp.code.toLowerCase().includes(lowerQuery)
    );
  }

  isCacheValid() {
    return this.employees.length > 0 && 
           (Date.now() - this.lastSync) < this.syncInterval;
  }
}

// ⭐ Clock In/Out Manager
class ClockManager {
  constructor(apiClient) {
    this.api = apiClient;
    this.currentUser = null;
    this.lastAction = null;
  }

  async clockIn(employeeName, options = {}) {
    try {
      const clockData = {
        employee: employeeName,
        userinfo: options.note || '',
        lat: options.latitude,
        lon: options.longitude,
        line_name: options.lineName,
        line_picture: options.linePicture,
        client_time: new Date().toISOString()
      };

      console.log('📱 Clock In Request:', clockData);
      
      const response = await this.api.call('/clockin', {
        method: 'POST',
        body: clockData
      });

      if (response.success) {
        this.lastAction = {
          type: 'clockin',
          employee: employeeName,
          time: response.timestamp,
          displayTime: response.time
        };
        
        // Clear cache to refresh status
        this.api.clearCache();
        
        console.log('📱 Clock In Success:', response);
        return {
          success: true,
          message: `ลงเวลาเข้า ${response.time} เรียบร้อย`,
          data: response
        };
      } else {
        return {
          success: false,
          message: response.msg || 'ไม่สามารถลงเวลาเข้าได้'
        };
      }
      
    } catch (error) {
      console.error('📱 Clock In Error:', error);
      
      // Store for offline sync if offline
      if (!navigator.onLine) {
        await this.storeOfflineAction('clockin', clockData);
        return {
          success: true,
          message: 'บันทึกลงเวลาเข้าไว้ จะส่งเมื่อออนไลน์',
          offline: true
        };
      }
      
      return {
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการลงเวลาเข้า'
      };
    }
  }

  async clockOut(employeeName, options = {}) {
    try {
      const clockData = {
        employee: employeeName,
        lat: options.latitude,
        lon: options.longitude,
        line_name: options.lineName,
        line_picture: options.linePicture,
        client_time: new Date().toISOString()
      };

      console.log('📱 Clock Out Request:', clockData);
      
      const response = await this.api.call('/clockout', {
        method: 'POST',
        body: clockData
      });

      if (response.success) {
        this.lastAction = {
          type: 'clockout',
          employee: employeeName,
          time: response.timestamp,
          displayTime: response.time
        };
        
        // Clear cache to refresh status
        this.api.clearCache();
        
        console.log('📱 Clock Out Success:', response);
        return {
          success: true,
          message: `ลงเวลาออก ${response.time} เรียบร้อย`,
          data: response
        };
      } else {
        return {
          success: false,
          message: response.msg || 'ไม่สามารถลงเวลาออกได้'
        };
      }
      
    } catch (error) {
      console.error('📱 Clock Out Error:', error);
      
      // Store for offline sync if offline
      if (!navigator.onLine) {
        await this.storeOfflineAction('clockout', clockData);
        return {
          success: true,
          message: 'บันทึกลงเวลาออกไว้ จะส่งเมื่อออนไลน์',
          offline: true
        };
      }
      
      return {
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการลงเวลาออก'
      };
    }
  }

  async checkStatus(employeeName) {
    try {
      const response = await this.api.call(`/status/${encodeURIComponent(employeeName)}`, {
        cacheTTL: 10000 // Cache for 10 seconds
      });
      
      if (response.success) {
        return response;
      }
      
      return { success: false, status: 'unknown' };
      
    } catch (error) {
      console.error('📱 Status Check Error:', error);
      return { success: false, status: 'error' };
    }
  }

  async getHistory(employeeName, limit = 7) {
    try {
      const response = await this.api.call(`/history/${encodeURIComponent(employeeName)}?limit=${limit}`, {
        cacheTTL: 60000 // Cache for 1 minute
      });
      
      return response.success ? response.history : [];
      
    } catch (error) {
      console.error('📱 History Error:', error);
      return [];
    }
  }

  // Store action for offline sync
  async storeOfflineAction(type, data) {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['pendingActions'], 'readwrite');
      const store = transaction.objectStore('pendingActions');
      
      await store.add({
        type,
        data,
        timestamp: Date.now(),
        id: Date.now() + Math.random()
      });
      
      console.log('📱 Stored offline action:', type);
    } catch (error) {
      console.error('📱 Failed to store offline action:', error);
    }
  }

  // IndexedDB helper
  openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('TimeTrackerMobile', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('pendingActions')) {
          db.createObjectStore('pendingActions', { keyPath: 'id' });
        }
      };
    });
  }
}

// ⭐ Location Manager
class LocationManager {
  constructor() {
    this.lastLocation = null;
    this.watchId = null;
    this.accuracy = 50; // meters
  }

  async getCurrentLocation(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation ไม่รองรับในอุปกรณ์นี้'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('ขอตำแหน่งหมดเวลา'));
      }, timeout);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          };
          
          this.lastLocation = location;
          console.log('📱 Location obtained:', location);
          resolve(location);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error('📱 Location error:', error);
          
          let message = 'ไม่สามารถขอตำแหน่งได้';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'ไม่อนุญาตให้เข้าถึงตำแหน่ง';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'ไม่สามารถหาตำแหน่งได้';
              break;
            case error.TIMEOUT:
              message = 'หาตำแหน่งหมดเวลา';
              break;
          }
          
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: timeout - 1000,
          maximumAge: 30000 // 30 seconds
        }
      );
    });
  }

  startWatching() {
    if (!navigator.geolocation || this.watchId) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };
      },
      (error) => {
        console.warn('📱 Location watch error:', error);
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000
      }
    );
  }

  stopWatching() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  getLastLocation() {
    return this.lastLocation;
  }
}

// ⭐ Settings Manager
class SettingsManager {
  constructor(apiClient) {
    this.api = apiClient;
    this.settings = {};
    this.lastSync = 0;
  }

  async loadSettings() {
    try {
      // Load multiple settings in one batch call
      const response = await this.api.call('/batch', {
        method: 'POST',
        body: {
          operations: [
            { type: 'get_settings' }
          ]
        },
        cacheTTL: 5 * 60 * 1000 // 5 minutes
      });

      if (response.success && response.results?.[0]?.success) {
        this.settings = response.results[0].data;
        this.lastSync = Date.now();
        console.log('📱 Settings loaded:', this.settings);
      }

      return this.settings;
      
    } catch (error) {
      console.error('📱 Failed to load settings:', error);
      return this.settings;
    }
  }

  getSetting(key, defaultValue = null) {
    return this.settings[key] || defaultValue;
  }

  getLiffId() {
    return this.getSetting('liff_id', '2001032478-VR5Akj0k');
  }
}

// Export classes for use in other modules
window.MobileTimeTracker = {
  APIClient: MobileAPIClient,
  EmployeeManager,
  ClockManager,
  LocationManager,
  SettingsManager
};