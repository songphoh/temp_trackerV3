// public/js/mobile-app.js - Main Application Logic สำหรับ Mobile

class MobileTimeTrackerApp {
  constructor() {
    this.isInitialized = false;
    this.currentUser = null;
    this.isOnline = navigator.onLine;
    
    // Initialize core services
    this.api = new MobileTimeTracker.APIClient();
    this.employees = new MobileTimeTracker.EmployeeManager(this.api);
    this.clock = new MobileTimeTracker.ClockManager(this.api);
    this.location = new MobileTimeTracker.LocationManager();
    this.settings = new MobileTimeTracker.SettingsManager(this.api);
    
    // UI Components
    this.employeeAutocomplete = null;
    this.statusDisplay = null;
    
    // State
    this.currentLocation = null;
    this.syncInProgress = false;
    
    this.init();
  }

  async init() {
    console.log('📱 Initializing Mobile Time Tracker App...');
    
    try {
      // Show initial loading
      const loaderId = MobileUI.loading.show('loading', 'กำลังเริ่มแอพพลิเคชัน...');
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }
      
      // Initialize in parallel
      await Promise.all([
        this.initializeUI(),
        this.loadInitialData(),
        this.setupEventHandlers()
      ]);
      
      // Start location services
      this.startLocationServices();
      
      // Setup periodic sync
      this.setupPeriodicSync();
      
      MobileUI.loading.hide(loaderId);
      this.isInitialized = true;
      
      console.log('📱 App initialized successfully');
      MobileUI.toast.success('แอพพร้อมใช้งานแล้ว');
      
    } catch (error) {
      console.error('📱 Failed to initialize app:', error);
      MobileUI.toast.error('ไม่สามารถเริ่มแอพได้: ' + error.message);
    }
  }

  async initializeUI() {
    console.log('📱 Initializing UI components...');
    
    // Initialize form handler
    MobileUI.form.register('clock-form', {
      validateOnChange: true,
      preventDoubleSubmit: true
    });
    
    // Initialize employee autocomplete
    this.employeeAutocomplete = MobileUI.ui.createAutocomplete('employee-input', {
      minChars: 2,
      maxResults: 10,
      showCodes: true,
      placeholder: 'พิมพ์ชื่อหรือรหัสพนักงาน'
    });
    
    // Initialize status display
    this.statusDisplay = MobileUI.ui.createStatusDisplay('status-container');
    
    // Setup button handlers
    this.setupButtonHandlers();
  }

  setupButtonHandlers() {
    // Clock In button
    const clockInBtn = document.getElementById('clock-in-btn');
    if (clockInBtn) {
      clockInBtn.addEventListener('click', () => this.handleClockIn());
    }
    
    // Clock Out button
    const clockOutBtn = document.getElementById('clock-out-btn');
    if (clockOutBtn) {
      clockOutBtn.addEventListener('click', () => this.handleClockOut());
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.handleRefresh());
    }
    
    // Location button
    const locationBtn = document.getElementById('location-btn');
    if (locationBtn) {
      locationBtn.addEventListener('click', () => this.handleLocationRequest());
    }
    
    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.handleSettings());
    }
  }

  async loadInitialData() {
    console.log('📱 Loading initial data...');
    
    try {
      // Load employees and settings in parallel
      await Promise.all([
        this.loadEmployees(),
        this.loadSettings()
      ]);
      
    } catch (error) {
      console.error('📱 Failed to load initial data:', error);
      // Don't throw - app can still work with cached data
    }
  }

  async loadEmployees() {
    try {
      const employees = await this.employees.getEmployees();
      
      if (this.employeeAutocomplete) {
        this.employeeAutocomplete.setEmployees(employees);
      }
      
      console.log(`📱 Loaded ${employees.length} employees`);
      
    } catch (error) {
      console.error('📱 Failed to load employees:', error);
      MobileUI.toast.warning('ไม่สามารถโหลดรายชื่อพนักงานได้');
    }
  }

  async loadSettings() {
    try {
      await this.settings.loadSettings();
      console.log('📱 Settings loaded');
      
    } catch (error) {
      console.error('📱 Failed to load settings:', error);
    }
  }

  setupEventHandlers() {
    // Online/Offline handlers
    window.addEventListener('online', () => {
      this.isOnline = true;
      MobileUI.toast.success('เชื่อมต่ออินเทอร์เน็ตแล้ว');
      this.syncOfflineData();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      MobileUI.toast.warning('ไม่มีการเชื่อมต่ออินเทอร์เน็ต');
    });
    
    // Employee selection handler
    const employeeInput = document.getElementById('employee-input');
    if (employeeInput) {
      employeeInput.addEventListener('employee-selected', (e) => {
        this.handleEmployeeSelected(e.detail);
      });
      
      employeeInput.addEventListener('input', () => {
        this.clearStatus();
      });
    }
    
    // Form submission
    const clockForm = document.getElementById('clock-form');
    if (clockForm) {
      clockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // Handle based on current state
        this.handleFormSubmit();
      });
    }
    
    // Visibility change handler for sync
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncOfflineData();
      }
    });
  }

  startLocationServices() {
    // Start watching location if permission granted
    this.location.startWatching();
  }

  setupPeriodicSync() {
    // Sync every 5 minutes if online
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.syncOfflineData();
      }
    }, 5 * 60 * 1000);
  }

  async handleEmployeeSelected(employee) {
    console.log('📱 Employee selected:', employee);
    this.currentUser = employee;
    
    // Check current status
    await this.updateEmployeeStatus(employee.name);
  }

  async updateEmployeeStatus(employeeName) {
    if (!employeeName) return;
    
    try {
      const status = await this.clock.checkStatus(employeeName);
      
      if (this.statusDisplay) {
        this.statusDisplay.update(status);
      }
      
      // Update button states
      this.updateButtonStates(status.status);
      
    } catch (error) {
      console.error('📱 Failed to check status:', error);
    }
  }

  updateButtonStates(status) {
    const clockInBtn = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');
    
    if (!clockInBtn || !clockOutBtn) return;
    
    switch (status) {
      case 'not_clocked_in':
        clockInBtn.disabled = false;
        clockOutBtn.disabled = true;
        clockInBtn.textContent = '🕓 เข้างาน';
        break;
        
      case 'clocked_in':
        clockInBtn.disabled = true;
        clockOutBtn.disabled = false;
        clockOutBtn.textContent = '🕓 ออกงาน';
        break;
        
      case 'completed':
        clockInBtn.disabled = true;
        clockOutBtn.disabled = true;
        break;
        
      default:
        clockInBtn.disabled = false;
        clockOutBtn.disabled = false;
    }
  }

  async handleClockIn() {
    if (!this.validateForm()) return;
    
    const employee = this.employeeAutocomplete.getSelectedEmployee();
    const note = document.getElementById('note-input')?.value || '';
    
    const loaderId = MobileUI.loading.show('submitting', 'กำลังลงเวลาเข้า...');
    
    try {
      // Get location
      const location = await this.getCurrentLocation();
      
      // Get LINE profile if available
      const lineProfile = await this.getLineProfile();
      
      const result = await this.clock.clockIn(employee.name, {
        note,
        latitude: location?.latitude,
        longitude: location?.longitude,
        lineName: lineProfile?.displayName,
        linePicture: lineProfile?.pictureUrl
      });
      
      MobileUI.loading.hide(loaderId);
      
      if (result.success) {
        if (result.offline) {
          MobileUI.toast.warning(result.message);
        } else {
          MobileUI.toast.success(result.message);
        }
        
        // Clear form and refresh status
        this.clearForm();
        await this.updateEmployeeStatus(employee.name);
        
      } else {
        MobileUI.toast.error(result.message);
      }
      
    } catch (error) {
      MobileUI.loading.hide(loaderId);
      console.error('📱 Clock in error:', error);
      MobileUI.toast.error('ไม่สามารถลงเวลาเข้าได้: ' + error.message);
    }
  }

  async handleClockOut() {
    if (!this.currentUser) {
      MobileUI.toast.error('กรุณาเลือกพนักงาน');
      return;
    }
    
    const loaderId = MobileUI.loading.show('submitting', 'กำลังลงเวลาออก...');
    
    try {
      // Get location
      const location = await this.getCurrentLocation();
      
      // Get LINE profile if available
      const lineProfile = await this.getLineProfile();
      
      const result = await this.clock.clockOut(this.currentUser.name, {
        latitude: location?.latitude,
        longitude: location?.longitude,
        lineName: lineProfile?.displayName,
        linePicture: lineProfile?.pictureUrl
      });
      
      MobileUI.loading.hide(loaderId);
      
      if (result.success) {
        if (result.offline) {
          MobileUI.toast.warning(result.message);
        } else {
          MobileUI.toast.success(result.message);
        }
        
        // Refresh status
        await this.updateEmployeeStatus(this.currentUser.name);
        
      } else {
        MobileUI.toast.error(result.message);
      }
      
    } catch (error) {
      MobileUI.loading.hide(loaderId);
      console.error('📱 Clock out error:', error);
      MobileUI.toast.error('ไม่สามารถลงเวลาออกได้: ' + error.message);
    }
  }

  async getCurrentLocation() {
    try {
      // Try to get fresh location
      const location = await this.location.getCurrentLocation(5000);
      this.currentLocation = location;
      return location;
      
    } catch (error) {
      console.warn('📱 Failed to get current location:', error);
      
      // Fallback to last known location
      const lastLocation = this.location.getLastLocation();
      if (lastLocation && (Date.now() - lastLocation.timestamp) < 10 * 60 * 1000) {
        console.log('📱 Using last known location');
        return lastLocation;
      }
      
      MobileUI.toast.warning('ไม่สามารถระบุตำแหน่งได้');
      return null;
    }
  }

  async getLineProfile() {
    if (typeof liff === 'undefined' || !liff.isInClient() || !liff.isLoggedIn()) {
      return null;
    }
    
    try {
      return await liff.getProfile();
    } catch (error) {
      console.warn('📱 Failed to get LINE profile:', error);
      return null;
    }
  }

  validateForm() {
    if (!MobileUI.form.validateForm('clock-form')) {
      MobileUI.toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return false;
    }
    
    if (!this.currentUser) {
      MobileUI.toast.error('กรุณาเลือกพนักงาน');
      return false;
    }
    
    return true;
  }

  clearForm() {
    MobileUI.form.reset('clock-form');
    if (this.employeeAutocomplete) {
      this.employeeAutocomplete.clear();
    }
    this.currentUser = null;
  }

  clearStatus() {
    if (this.statusDisplay) {
      this.statusDisplay.clear();
    }
    this.updateButtonStates('unknown');
  }

  async handleRefresh() {
    const loaderId = MobileUI.loading.show('fetching', 'กำลังรีเฟรชข้อมูล...');
    
    try {
      await Promise.all([
        this.loadEmployees(),
        this.currentUser ? this.updateEmployeeStatus(this.currentUser.name) : Promise.resolve()
      ]);
      
      MobileUI.loading.hide(loaderId);
      MobileUI.toast.success('รีเฟรชข้อมูลเรียบร้อย');
      
    } catch (error) {
      MobileUI.loading.hide(loaderId);
      console.error('📱 Refresh error:', error);
      MobileUI.toast.error('ไม่สามารถรีเฟรชข้อมูลได้');
    }
  }

  async handleLocationRequest() {
    const loaderId = MobileUI.loading.show('fetching', 'กำลังขอตำแหน่ง...');
    
    try {
      const location = await this.getCurrentLocation();
      MobileUI.loading.hide(loaderId);
      
      if (location) {
        MobileUI.toast.success('ได้รับตำแหน่งแล้ว');
        
        // Show location info if debug mode
        if (this.isDebugMode()) {
          console.log('📱 Current location:', location);
          MobileUI.toast.info(`ตำแหน่ง: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
        }
      } else {
        MobileUI.toast.error('ไม่สามารถได้รับตำแหน่งได้');
      }
      
    } catch (error) {
      MobileUI.loading.hide(loaderId);
      console.error('📱 Location request error:', error);
      MobileUI.toast.error('ไม่สามารถขอตำแหน่งได้: ' + error.message);
    }
  }

  handleSettings() {
    // Show settings modal
    this.showSettingsModal();
  }

  showSettingsModal() {
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="modal-overlay" onclick="this.parentElement.remove()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>การตั้งค่า</h3>
            <button class="modal-close" onclick="this.closest('.settings-modal').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="setting-item">
              <label>
                <input type="checkbox" id="debug-mode" ${this.isDebugMode() ? 'checked' : ''}>
                โหมดดีบัก
              </label>
            </div>
            <div class="setting-item">
              <label>
                <input type="checkbox" id="auto-location" ${this.isAutoLocationEnabled() ? 'checked' : ''}>
                ขอตำแหน่งอัตโนมัติ
              </label>
            </div>
            <div class="setting-item">
              <button onclick="timeTrackerApp.clearCache()" class="btn btn-secondary">
                ล้างข้อมูลแคช
              </button>
            </div>
            <div class="setting-item">
              <button onclick="timeTrackerApp.exportDebugData()" class="btn btn-secondary">
                ส่งออกข้อมูลดีบัก
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="this.closest('.settings-modal').remove()" class="btn btn-primary">
              ปิด
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup event listeners
    const debugMode = modal.querySelector('#debug-mode');
    const autoLocation = modal.querySelector('#auto-location');
    
    debugMode?.addEventListener('change', (e) => {
      this.setDebugMode(e.target.checked);
    });
    
    autoLocation?.addEventListener('change', (e) => {
      this.setAutoLocation(e.target.checked);
    });
  }

  async handleFormSubmit() {
    if (!this.currentUser) {
      MobileUI.toast.error('กรุณาเลือกพนักงาน');
      return;
    }
    
    // Check current status to determine action
    try {
      const status = await this.clock.checkStatus(this.currentUser.name);
      
      if (status.status === 'not_clocked_in') {
        await this.handleClockIn();
      } else if (status.status === 'clocked_in') {
        await this.handleClockOut();
      } else {
        MobileUI.toast.warning('ไม่สามารถดำเนินการได้ในขณะนี้');
      }
      
    } catch (error) {
      console.error('📱 Form submit error:', error);
      MobileUI.toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  }

  async syncOfflineData() {
    if (this.syncInProgress || !this.isOnline) return;
    
    this.syncInProgress = true;
    console.log('📱 Starting offline data sync...');
    
    try {
      // Get pending actions from IndexedDB
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['pendingActions'], 'readonly');
      const store = transaction.objectStore('pendingActions');
      const pendingActions = await this.getAllFromStore(store);
      
      if (pendingActions.length === 0) {
        this.syncInProgress = false;
        return;
      }
      
      console.log(`📱 Found ${pendingActions.length} pending actions to sync`);
      
      let syncedCount = 0;
      let failedCount = 0;
      
      for (const action of pendingActions) {
        try {
          let result;
          
          if (action.type === 'clockin') {
            result = await this.clock.clockIn(action.data.employee, action.data);
          } else if (action.type === 'clockout') {
            result = await this.clock.clockOut(action.data.employee, action.data);
          }
          
          if (result?.success && !result?.offline) {
            // Remove from pending if successful
            await this.removeFromIndexedDB(action.id);
            syncedCount++;
          } else {
            failedCount++;
          }
          
        } catch (error) {
          console.error('📱 Failed to sync action:', action, error);
          failedCount++;
        }
      }
      
      if (syncedCount > 0) {
        MobileUI.toast.success(`ส่งข้อมูลออฟไลน์ ${syncedCount} รายการเรียบร้อย`);
      }
      
      if (failedCount > 0) {
        MobileUI.toast.warning(`ส่งข้อมูลไม่สำเร็จ ${failedCount} รายการ`);
      }
      
    } catch (error) {
      console.error('📱 Sync error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async openIndexedDB() {
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

  async getAllFromStore(store) {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removeFromIndexedDB(id) {
    const db = await this.openIndexedDB();
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Utility methods
  isDebugMode() {
    return localStorage.getItem('debug-mode') === 'true';
  }

  setDebugMode(enabled) {
    localStorage.setItem('debug-mode', enabled.toString());
    if (enabled) {
      console.log('📱 Debug mode enabled');
      MobileUI.toast.info('เปิดโหมดดีบัก');
    } else {
      console.log('📱 Debug mode disabled');
      MobileUI.toast.info('ปิดโหมดดีบัก');
    }
  }

  isAutoLocationEnabled() {
    return localStorage.getItem('auto-location') !== 'false';
  }

  setAutoLocation(enabled) {
    localStorage.setItem('auto-location', enabled.toString());
    if (enabled) {
      this.location.startWatching();
      MobileUI.toast.info('เปิดการขอตำแหน่งอัตโนมัติ');
    } else {
      this.location.stopWatching();
      MobileUI.toast.info('ปิดการขอตำแหน่งอัตโนมัติ');
    }
  }

  async clearCache() {
    try {
      // Clear API cache
      this.api.clearCache();
      
      // Clear employees cache
      this.employees.lastSync = 0;
      this.employees.employees = [];
      
      // Clear localStorage cache
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('timetracker-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear UI state
      this.clearForm();
      this.clearStatus();
      
      MobileUI.toast.success('ล้างข้อมูลแคชเรียบร้อย');
      
      // Reload data
      await this.loadInitialData();
      
    } catch (error) {
      console.error('📱 Clear cache error:', error);
      MobileUI.toast.error('ไม่สามารถล้างข้อมูลแคชได้');
    }
  }

  async exportDebugData() {
    try {
      const debugData = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        isOnline: this.isOnline,
        currentUser: this.currentUser,
        currentLocation: this.currentLocation,
        settings: this.settings.settings,
        employees: this.employees.employees.length,
        apiCacheSize: this.api.cache.size,
        localStorage: Object.keys(localStorage).filter(k => k.startsWith('timetracker-')),
        errors: this.getRecentErrors()
      };
      
      const dataStr = JSON.stringify(debugData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetracker-debug-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      MobileUI.toast.success('ส่งออกข้อมูลดีบักเรียบร้อย');
      
    } catch (error) {
      console.error('📱 Export debug data error:', error);
      MobileUI.toast.error('ไม่สามารถส่งออกข้อมูลดีบักได้');
    }
  }

  getRecentErrors() {
    // This would collect recent errors from console or error tracking
    return [];
  }

  // Public API methods
  getStatus() {
    return {
      initialized: this.isInitialized,
      online: this.isOnline,
      currentUser: this.currentUser,
      syncInProgress: this.syncInProgress
    };
  }

  async forceSync() {
    if (this.isOnline) {
      await this.syncOfflineData();
    } else {
      MobileUI.toast.warning('ไม่มีการเชื่อมต่ออินเทอร์เน็ต');
    }
  }

  async refreshData() {
    await this.handleRefresh();
  }
}

// Initialize app when script loads
let timeTrackerApp;

// Wait for dependencies to load
function initializeApp() {
  if (typeof MobileTimeTracker === 'undefined' || typeof MobileUI === 'undefined') {
    console.log('📱 Waiting for dependencies...');
    setTimeout(initializeApp, 100);
    return;
  }
  
  console.log('📱 Dependencies loaded, starting app...');
  timeTrackerApp = new MobileTimeTrackerApp();
  
  // Expose to global scope for debugging
  window.timeTrackerApp = timeTrackerApp;
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MobileTimeTrackerApp;
}