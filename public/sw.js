// public/sw.js - Service Worker สำหรับ Mobile PWA

const CACHE_NAME = 'time-tracker-mobile-v1.2';
const STATIC_CACHE = 'static-v1.2';
const API_CACHE = 'api-v1.2';

// ไฟล์ที่ต้อง cache ทันที
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/mobile-optimized.css',
  '/js/main.js',
  '/js/mobile-core.js',
  '/js/mobile-ui.js',
  '/js/mobile-app.js',
  '/js/performance-monitor.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css',
  'https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js'
];

// API endpoints ที่สามารถ cache ได้
const CACHEABLE_APIS = [
  '/api/mobile/employees',
  '/api/mobile/dashboard',
  '/api/getLiffId',
  '/api/getTimeOffset',
  '/api/getdata',
  '/api/getemployee'
];

// ⭐ Install Event - Cache static resources
self.addEventListener('install', event => {
  console.log('📱 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('📱 Service Worker: Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      })
      .then(() => {
        console.log('📱 Service Worker: Installed successfully');
        return self.skipWaiting(); // เปิดใช้ทันที
      })
      .catch(err => {
        console.error('📱 Service Worker: Install failed', err);
      })
  );
});

// ⭐ Activate Event - Clean old caches
self.addEventListener('activate', event => {
  console.log('📱 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // ลบ cache เวอร์ชันเก่า
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('📱 Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('📱 Service Worker: Activated successfully');
        return self.clients.claim(); // ควบคุม clients ทันที
      })
  );
});

// ⭐ Fetch Event - Smart caching strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // ข้าม cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // ข้าม non-GET requests (POST, PUT, DELETE)
  if (request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    handleRequest(request)
  );
});

// ⭐ Smart Request Handler
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // 1. Static resources - Cache First
    if (isStaticResource(url.pathname)) {
      return await cacheFirst(request, STATIC_CACHE);
    }
    
    // 2. API calls - Network First with fallback
    if (url.pathname.startsWith('/api/')) {
      return await networkFirstWithFallback(request);
    }
    
    // 3. HTML pages - Network First
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      return await networkFirst(request, STATIC_CACHE);
    }
    
    // 4. Default - Network only
    return await fetch(request);
    
  } catch (error) {
    console.error('📱 Service Worker: Request failed', request.url, error);
    
    // ส่งกลับหน้า offline ถ้ามี
    if (request.destination === 'document') {
      const offlineResponse = await caches.match('/offline.html');
      return offlineResponse || new Response('ไม่มีการเชื่อมต่ออินเทอร์เน็ต');
    }
    
    throw error;
  }
}

// ⭐ Cache First Strategy (สำหรับ static resources)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('📱 SW: Cache hit', request.url);
    return cached;
  }
  
  console.log('📱 SW: Fetching and caching', request.url);
  const response = await fetch(request);
  
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  
  return response;
}

// ⭐ Network First Strategy (สำหรับ API calls)
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    
    if (response.ok && cacheName) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('📱 SW: Network failed, checking cache', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// ⭐ Network First with Smart Fallback (สำหรับ API)
async function networkFirstWithFallback(request) {
  const url = new URL(request.url);
  
  try {
    // ลอง network ก่อน
    const response = await fetch(request);
    
    if (response.ok) {
      // Cache API responses ที่ cache ได้
      if (isCacheableAPI(url.pathname)) {
        const cache = await caches.open(API_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }
    
    throw new Error(`HTTP ${response.status}`);
    
  } catch (error) {
    console.log('📱 SW: API network failed', request.url, error.message);
    
    // ลอง cache ถ้า network ล้มเหลว
    const cached = await caches.match(request);
    if (cached) {
      console.log('📱 SW: Serving cached API response', request.url);
      
      // เพิ่ม header บอกว่ามาจาก cache
      const headers = new Headers(cached.headers);
      headers.set('X-Served-By', 'ServiceWorker');
      headers.set('X-Cache-Date', cached.headers.get('date') || 'unknown');
      
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: headers
      });
    }
    
    // ถ้าไม่มี cache ให้ส่งกลับ offline response
    return createOfflineAPIResponse(url.pathname);
  }
}

// ⭐ Helper Functions
function isStaticResource(pathname) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
  return staticExtensions.some(ext => pathname.endsWith(ext)) || 
         pathname === '/' || 
         pathname.endsWith('.html');
}

function isCacheableAPI(pathname) {
  return CACHEABLE_APIS.some(api => pathname.startsWith(api));
}

function createOfflineAPIResponse(pathname) {
  let offlineData = { success: false, msg: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต' };
  
  // ส่งข้อมูล mock สำหรับ API บางตัว
  if (pathname.includes('/employees')) {
    offlineData = {
      success: false,
      msg: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต',
      offline: true,
      employees: [] // ข้อมูลว่าง
    };
  } else if (pathname.includes('/dashboard')) {
    offlineData = {
      success: false,
      msg: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต',
      offline: true,
      today: {
        total_employees: 0,
        checked_in: 0,
        not_checked_out: 0,
        date: new Date().toLocaleDateString('th-TH')
      }
    };
  } else if (pathname.includes('/getLiffId')) {
    offlineData = {
      success: true,
      liffId: '2001032478-VR5Akj0k'
    };
  }
  
  return new Response(JSON.stringify(offlineData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Served-By': 'ServiceWorker-Offline'
    }
  });
}

// ⭐ Background Sync สำหรับ offline actions
self.addEventListener('sync', event => {
  console.log('📱 SW: Background sync triggered', event.tag);
  
  if (event.tag === 'clock-in-sync') {
    event.waitUntil(syncClockInData());
  } else if (event.tag === 'clock-out-sync') {
    event.waitUntil(syncClockOutData());
  }
});

// ⭐ Sync offline clock-in data
async function syncClockInData() {
  try {
    const db = await openIndexedDB();
    const pendingClockIns = await getStoredData(db, 'pendingClockIns');
    
    for (const clockInData of pendingClockIns) {
      try {
        const response = await fetch('/api/clockin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clockInData.data)
        });
        
        if (response.ok) {
          await removeStoredData(db, 'pendingClockIns', clockInData.id);
          console.log('📱 SW: Synced clock-in data', clockInData.id);
          
          // แจ้งเตือน user
          showNotification('ลงเวลาเข้าสำเร็จ', 'ข้อมูลถูกส่งเมื่อออนไลน์แล้ว');
        }
      } catch (error) {
        console.error('📱 SW: Failed to sync clock-in', clockInData.id, error);
      }
    }
  } catch (error) {
    console.error('📱 SW: Background sync failed', error);
  }
}

// ⭐ Sync offline clock-out data
async function syncClockOutData() {
  try {
    const db = await openIndexedDB();
    const pendingClockOuts = await getStoredData(db, 'pendingClockOuts');
    
    for (const clockOutData of pendingClockOuts) {
      try {
        const response = await fetch('/api/clockout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clockOutData.data)
        });
        
        if (response.ok) {
          await removeStoredData(db, 'pendingClockOuts', clockOutData.id);
          console.log('📱 SW: Synced clock-out data', clockOutData.id);
          
          // แจ้งเตือน user
          showNotification('ลงเวลาออกสำเร็จ', 'ข้อมูลถูกส่งเมื่อออนไลน์แล้ว');
        }
      } catch (error) {
        console.error('📱 SW: Failed to sync clock-out', clockOutData.id, error);
      }
    }
  } catch (error) {
    console.error('📱 SW: Background sync failed', error);
  }
}

// ⭐ Push Notification Handler
self.addEventListener('push', event => {
  console.log('📱 SW: Push notification received');
  
  const options = {
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };
  
  if (event.data) {
    const data = event.data.json();
    options.body = data.message || options.body;
    options.data = data;
  }
  
  event.waitUntil(
    self.registration.showNotification('ระบบลงเวลา', options)
  );
});

// ⭐ Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('📱 SW: Notification clicked');
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.openWindow(url)
  );
});

// ⭐ Message Handler สำหรับ communication กับ main thread
self.addEventListener('message', event => {
  console.log('📱 SW: Message received', event.data);
  
  if (event.data && event.data.type === 'PERFORMANCE_REPORT') {
    console.log('📱 SW: Performance report received', event.data.metrics);
    
    // Store performance data
    storePerformanceData(event.data.metrics);
    
    // Send to analytics if needed
    // sendToAnalytics(event.data.metrics);
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CACHE_CLEAR') {
    clearAllCaches();
  }
});

// ⭐ IndexedDB Helper Functions
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TimeTrackerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingClockIns')) {
        db.createObjectStore('pendingClockIns', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('pendingClockOuts')) {
        db.createObjectStore('pendingClockOuts', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('performanceData')) {
        db.createObjectStore('performanceData', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getStoredData(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removeStoredData(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function storePerformanceData(data) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['performanceData'], 'readwrite');
    const store = transaction.objectStore('performanceData');
    
    await store.add({
      data: data,
      timestamp: Date.now()
    });
    
    console.log('📱 SW: Performance data stored');
  } catch (error) {
    console.error('📱 SW: Failed to store performance data', error);
  }
}

function showNotification(title, body) {
  if (self.registration.showNotification) {
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      vibrate: [200, 100, 200]
    });
  }
}

async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('📱 SW: All caches cleared');
  } catch (error) {
    console.error('📱 SW: Failed to clear caches', error);
  }
}

// ⭐ Periodic Background Sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('📱 SW: Periodic background sync');
  
  try {
    // Sync offline data
    await syncClockInData();
    await syncClockOutData();
    
    // Clean old cache entries
    await cleanOldCacheEntries();
    
    console.log('📱 SW: Background sync completed');
  } catch (error) {
    console.error('📱 SW: Background sync failed', error);
  }
}

async function cleanOldCacheEntries() {
  try {
    const cache = await caches.open(API_CACHE);
    const requests = await cache.keys();
    
    // Remove cache entries older than 1 hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (responseDate < oneHourAgo) {
          await cache.delete(request);
          console.log('📱 SW: Removed old cache entry', request.url);
        }
      }
    }
  } catch (error) {
    console.error('📱 SW: Failed to clean old cache entries', error);
  }
}

// ⭐ Error Handler
self.addEventListener('error', event => {
  console.error('📱 SW: Service Worker error', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('📱 SW: Unhandled promise rejection', event.reason);
});

console.log('📱 Service Worker: Script loaded successfully');