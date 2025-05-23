// Enhanced main.js - เพิ่ม Mobile Performance
// เก็บโค้ดเดิมไว้ทั้งหมด และเพิ่มส่วน optimization

// กำหนด URL ของ API
var scripturl = '/api';
var owner = 'งานเทคโนโลยีสารสนเทศ' + '\n' + 'อบต.ข่าใหญ่';

// ตัวแปรสำหรับเก็บข้อมูลโปรไฟล์และพิกัด
var profile = null;
var gps;
var locationPermissionGranted = false;

// ⭐ เพิ่มตัวแปรสำหรับ mobile performance
var mobilePerf = {
  apiCache: new Map(),
  requestQueue: [],
  isProcessing: false,
  retryCount: 0,
  maxRetries: 3
};

// ⭐ Performance-optimized API call
function optimizedAjax(options) {
  return new Promise((resolve, reject) => {
    // Check cache first
    const cacheKey = `${options.method || 'GET'}:${options.url}:${JSON.stringify(options.data || {})}`;
    const cached = mobilePerf.apiCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
      console.log('📱 Using cached response for:', options.url);
      resolve(cached.data);
      return;
    }

    // Add timeout and retry logic
    const originalSuccess = options.success;
    const originalError = options.error;
    
    options.timeout = options.timeout || 10000; // 10 second timeout
    
    options.success = function(data) {
      // Cache successful responses
      if (data && typeof data === 'object') {
        mobilePerf.apiCache.set(cacheKey, {
          data: data,
          timestamp: Date.now()
        });
      }
      
      if (originalSuccess) originalSuccess(data);
      resolve(data);
    };
    
    options.error = function(xhr, status, error) {
      console.error('📱 API Error:', status, error);
      
      // Retry logic for network errors
      if (mobilePerf.retryCount < mobilePerf.maxRetries && 
          (status === 'timeout' || status === 'error')) {
        mobilePerf.retryCount++;
        console.log(`📱 Retrying API call (${mobilePerf.retryCount}/${mobilePerf.maxRetries}):`, options.url);
        
        setTimeout(() => {
          $.ajax(options);
        }, 1000 * mobilePerf.retryCount); // Exponential backoff
        return;
      }
      
      mobilePerf.retryCount = 0;
      if (originalError) originalError(xhr, status, error);
      reject(new Error(`${status}: ${error}`));
    };
    
    $.ajax(options);
  });
}

// เมื่อโหลดหน้าเสร็จ
$(document).ready(function () {
  console.log('📱 App starting...');
  
  // ⭐ เริ่ม performance monitoring
  if (typeof MobilePerformanceMonitor !== 'undefined') {
    window.perfMonitor = new MobilePerformanceMonitor();
  }
  
  // กำหนดการทำงานของปุ่ม
  $('#clockin').click(() => requestLocationAndClockIn());
  $('#clockout').click(() => requestLocationAndClockOut());
  
  // แสดงเวลา
  showTime();
  
  // ⭐ เริ่มดึงตำแหน่ง GPS แบบ non-blocking
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      getlocation(false);
    });
  } else {
    setTimeout(() => {
      getlocation(false);
    }, 100);
  }

  // ดึง LIFF ID จากฐานข้อมูล
  optimizedAjax({
    method: "GET",
    url: "/api/getLiffId",
    success: function(response) {
      if (response && response.liffId) {
        initializeLiff(response.liffId);
      } else {
        console.error("ไม่พบ LIFF ID ในฐานข้อมูล");
        $('#message').html("ไม่สามารถเชื่อมต่อกับ LINE ได้ กรุณาติดต่อผู้ดูแลระบบ");
        document.getElementById('message').className = 'alert alert-danger';
      }
    },
    error: function(error) {
      console.error("เกิดข้อผิดพลาดในการดึง LIFF ID", error);
      $('#message').html("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
      document.getElementById('message').className = 'alert alert-danger';
    }
  });
});

// ⭐ Optimized LIFF initialization
function initializeLiff(liffId) {
  console.log("📱 กำลังเริ่มต้น LIFF ด้วย ID:", liffId);
  
  // Show loading state
  if (typeof MobileUI !== 'undefined') {
    const loaderId = MobileUI.loading.show('loading', 'กำลังเชื่อมต่อ LINE...');
    
    setTimeout(() => {
      MobileUI.loading.hide(loaderId);
    }, 5000); // Hide after 5 seconds max
  }
  
  liff.init({
    liffId: liffId,
    withLoginOnExternalBrowser: true
  }).then(() => {
    console.log("📱 LIFF initialized successfully");
    
    if (!liff.isLoggedIn()) {
      console.log("📱 User not logged in, triggering login");
      liff.login();
      return;
    }
    
    // ดึงข้อมูลโปรไฟล์
    liff.getProfile().then(userProfile => {
      profile = userProfile;
      console.log("📱 Profile loaded:", profile.displayName);
      
      // Show success toast
      if (typeof MobileUI !== 'undefined') {
        MobileUI.toast.success(`ยินดีต้อนรับ ${profile.displayName}`);
      }
      
      initApp();
    }).catch(err => {
      console.error("📱 Error getting profile:", err);
      initApp();
    });
  }).catch(err => {
    console.error("📱 LIFF initialization failed", err);
    $('#message').html("ไม่สามารถเชื่อมต่อกับ LINE ได้ กรุณาติดต่อผู้ดูแลระบบ");
    document.getElementById('message').className = 'alert alert-danger';
    
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.error("ไม่สามารถเชื่อมต่อ LINE ได้");
    }
    
    initApp();
  });
}

// ⭐ Optimized app initialization
function initApp() {
  console.log('📱 Initializing app...');
  
  document.getElementById('message').innerText = owner;
  document.getElementById('message').className = 'alert msgBg';
  
  // ⭐ Load employees with better error handling
  loadEmployeesOptimized();
}

// ⭐ Optimized employee loading
function loadEmployeesOptimized() {
  const loadingToast = typeof MobileUI !== 'undefined' ? 
    MobileUI.toast.loading('กำลังโหลดรายชื่อพนักงาน...') : null;
  
  Promise.all([
    optimizedAjax({
      method: "POST",
      url: scripturl + "/getdata",
      data: {},
      timeout: 8000
    }),
    optimizedAjax({
      method: "POST", 
      url: scripturl + "/getemployee",
      data: {},
      timeout: 8000
    })
  ]).then(([autocompleteData, employeeList]) => {
    // Hide loading toast
    if (loadingToast && typeof MobileUI !== 'undefined') {
      MobileUI.toast.hide(loadingToast);
    }
    
    // Setup autocomplete
    if (autocompleteData && Array.isArray(autocompleteData)) {
      setupAutocomplete(autocompleteData);
    }
    
    // Setup employee dropdown (keeping compatibility)
    if (employeeList && Array.isArray(employeeList)) {
      setupEmployeeDropdown(employeeList);
    }
    
    console.log(`📱 Loaded ${autocompleteData?.length || 0} employees for autocomplete`);
    
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.success('โหลดข้อมูลเรียบร้อย');
    }
    
  }).catch(error => {
    console.error('📱 Failed to load employees:', error);
    
    if (loadingToast && typeof MobileUI !== 'undefined') {
      MobileUI.toast.hide(loadingToast);
      MobileUI.toast.error('ไม่สามารถโหลดรายชื่อพนักงานได้');
    }
    
    // Try to use cached data
    const cachedData = mobilePerf.apiCache.get('POST:/api/getdata:{}');
    if (cachedData) {
      console.log('📱 Using cached employee data');
      setupAutocomplete(cachedData.data);
    }
  });
}

// ⭐ Setup autocomplete with mobile optimization
function setupAutocomplete(dataPerson) {
  $(function () {
    $("#employee, #employee-input").autocomplete({
      maxShowItems: 5, // Reduce for mobile
      source: dataPerson,
      minLength: 2,
      delay: 300, // Add delay to reduce API calls
      select: function(event, ui) {
        // Trigger custom event for mobile handlers
        if (typeof CustomEvent !== 'undefined') {
          const employeeSelectedEvent = new CustomEvent('employee-selected', {
            detail: {
              name: ui.item.value,
              code: ui.item.value,
              selectionTime: Date.now(),
              method: 'click'
            }
          });
          document.dispatchEvent(employeeSelectedEvent);
        }
      }
    });
  });
}

// ⭐ Setup employee dropdown (compatibility)
function setupEmployeeDropdown(employeeList) {
  const employeeSelect = document.getElementById("employee");
  if (!employeeSelect) return;

  // Clear existing options
  employeeSelect.innerHTML = '';

  let option = document.createElement("option");
  option.value = "";
  option.text = "";
  employeeSelect.appendChild(option);

  employeeList.forEach(function (item, index) {
    let option = document.createElement("option");
    option.value = item[0];
    option.text = item[0];
    employeeSelect.appendChild(option);
  });
}

// ฟังก์ชันดึงเวลาไคลเอ็นต์พร้อมดีบั๊ก (เดิม)
function getClientTime() {
  var currentTime = new Date();
  var isoString = currentTime.toISOString();
 
  console.group('Client Time Debugging');
  console.log('Original Time (Local):', currentTime);
  console.log('Original Time (ISO):', isoString);
  console.log('Timezone Offset:', 
    -currentTime.getTimezoneOffset(), 
    'minutes (Difference from UTC)'
  );
  console.groupEnd();
 
  return isoString;
}

// ⭐ Enhanced location request with better UX
function requestLocationAndClockIn() {
  event.preventDefault();
  const employee = document.getElementById("employee").value;
  
  if (employee === '') {
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.warning('กรุณาเลือกรายชื่อพนักงาน');
    } else {
      $('#message').html('กรุณาเลือกรายชื่อพนักงาน ...!');
      document.getElementById('message').className = 'alert alert-warning text-danger';
    }
    return;
  }
  
  // Record performance metric
  const startTime = performance.now();
  
  showLocationPermissionDialog(function(allowed) {
    if (allowed) {
      const locationToast = typeof MobileUI !== 'undefined' ? 
        MobileUI.toast.loading('กำลังขอตำแหน่ง...') : null;
      
      getlocation(true, function(success) {
        if (locationToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(locationToast);
        }
        
        if (success) {
          ClockIn();
        } else {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.error('ไม่สามารถดึงตำแหน่งได้');
          } else {
            $('#message').html('ไม่สามารถดึงตำแหน่งพิกัดได้');
            document.getElementById('message').className = 'alert alert-danger';
          }
        }
        
        // Record performance
        const duration = performance.now() - startTime;
        if (typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('clock-action', {
            detail: {
              type: 'clockin',
              success: success,
              duration: duration,
              offline: !navigator.onLine
            }
          }));
        }
      });
    } else {
      if (typeof MobileUI !== 'undefined') {
        MobileUI.toast.warning('การลงเวลาจะไม่มีข้อมูลพิกัด');
      }
      
      setTimeout(function() {
        ClockIn();
      }, 1500);
    }
  });
}

// ⭐ Enhanced location request for clock out
function requestLocationAndClockOut() {
  event.preventDefault();
  const employee = document.getElementById("employee").value;
  
  if (employee === '') {
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.warning('กรุณาเลือกรายชื่อพนักงาน');
    } else {
      $('#message').html('กรุณาเลือกรายชื่อพนักงาน ...!');
      document.getElementById('message').className = 'alert alert-warning text-danger';
    }
    return;
  }
  
  const startTime = performance.now();
  
  showLocationPermissionDialog(function(allowed) {
    if (allowed) {
      const locationToast = typeof MobileUI !== 'undefined' ? 
        MobileUI.toast.loading('กำลังขอตำแหน่ง...') : null;
      
      getlocation(true, function(success) {
        if (locationToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(locationToast);
        }
        
        if (success) {
          ClockOut();
        } else {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.error('ไม่สามารถดึงตำแหน่งได้');
          }
        }
        
        // Record performance
        const duration = performance.now() - startTime;
        if (typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('clock-action', {
            detail: {
              type: 'clockout', 
              success: success,
              duration: duration,
              offline: !navigator.onLine
            }
          }));
        }
      });
    } else {
      if (typeof MobileUI !== 'undefined') {
        MobileUI.toast.warning('การลงเวลาจะไม่มีข้อมูลพิกัด');
      }
      
      setTimeout(function() {
        ClockOut();
      }, 1500);
    }
  });
}

// ⭐ Enhanced location permission dialog
function showLocationPermissionDialog(callback) {
  if (locationPermissionGranted) {
    callback(true);
    return;
  }
  
  // ใช้ mobile UI modal ถ้ามี
  if (typeof MobileUI !== 'undefined') {
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>📍 ขออนุญาตใช้ตำแหน่งที่ตั้ง</h3>
          </div>
          <div class="modal-body">
            <div class="text-center mb-4">
              <div style="font-size: 64px; margin-bottom: 16px;">📍</div>
            </div>
            <p class="text-center">ระบบต้องการเข้าถึงตำแหน่งที่ตั้งของคุณเพื่อบันทึกพิกัดการลงเวลา</p>
            <p class="text-center" style="font-size: 14px; color: #666;">ข้อมูลนี้จะถูกใช้เพื่อยืนยันตำแหน่งที่คุณลงเวลาเท่านั้น</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="denyLocationBtn">
              ❌ ไม่อนุญาต
            </button>
            <button type="button" class="btn btn-primary" id="allowLocationBtn">
              ✅ อนุญาต
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event handlers
    modal.querySelector('#allowLocationBtn').addEventListener('click', () => {
      locationPermissionGranted = true;
      document.body.removeChild(modal);
      callback(true);
    });
    
    modal.querySelector('#denyLocationBtn').addEventListener('click', () => {
      document.body.removeChild(modal);
      callback(false);
    });
    
    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
      if (e.target === modal.querySelector('.modal-overlay')) {
        document.body.removeChild(modal);
        callback(false);
      }
    });
    
    return;
  }
  
  // Fallback to original modal code
  var modalHtml = `
  <div class="modal fade" id="locationPermissionModal" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title">📍 ขออนุญาตใช้ตำแหน่งที่ตั้ง</h5>
        </div>
        <div class="modal-body">
          <div class="text-center mb-4">
            <div style="font-size: 64px;">📍</div>
          </div>
          <p class="lead text-center">ระบบต้องการเข้าถึงตำแหน่งที่ตั้งของคุณเพื่อบันทึกพิกัดการลงเวลา</p>
          <p class="text-muted text-center">ข้อมูลนี้จะถูกใช้เพื่อยืนยันตำแหน่งที่คุณลงเวลาเท่านั้น</p>
        </div>
        <div class="modal-footer justify-content-center">
          <button type="button" class="btn btn-secondary px-4" id="denyLocationBtn">
            ❌ ไม่อนุญาต
          </button>
          <button type="button" class="btn btn-primary px-4" id="allowLocationBtn">
            ✅ อนุญาต
          </button>
        </div>
      </div>
    </div>
  </div>
  `;
  
  $('body').append(modalHtml);
  $('#locationPermissionModal').modal('show');
  
  $('#allowLocationBtn').on('click', function() {
    $('#locationPermissionModal').modal('hide');
    locationPermissionGranted = true;
    setTimeout(() => {
      $('#locationPermissionModal').remove();
      callback(true);
    }, 300);
  });
  
  $('#denyLocationBtn').on('click', function() {
    $('#locationPermissionModal').modal('hide');
    setTimeout(() => {
      $('#locationPermissionModal').remove();
      callback(false);
    }, 300);
  });
}

// ⭐ Enhanced ClockIn with better mobile UX
function ClockIn() {
  const employee = document.getElementById("employee").value;
  const userinfo = document.getElementById("userinfo").value;

  if (employee != '') {
    // Show mobile-friendly loading
    const loadingToast = typeof MobileUI !== 'undefined' ? 
      MobileUI.toast.loading('กำลังลงเวลาเข้า...') : null;
    
    if (!loadingToast) {
      $('#message').html("<span class='spinner-border spinner-border-sm text-primary'></span> โปรดรอสักครู่ ...!");
    }
    
    const clientTime = getClientTime();
    
    const apiData = {
      employee,
      userinfo,
      lat: gps ? gps[0] : null,
      lon: gps ? gps[1] : null,
      client_time: clientTime
    };
    
    if (profile) {
      apiData.line_name = profile.displayName;
      apiData.line_picture = profile.pictureUrl;
    }
    
    console.group('📱 Clock In Request');
    console.log('API Data:', apiData);
    console.log('Network Status:', navigator.onLine ? 'Online' : 'Offline');
    console.groupEnd();
    
    optimizedAjax({
      method: 'POST',
      url: scripturl + "/clockin",
      data: apiData,
      timeout: 15000,
      success: function (res) {
        if (loadingToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(loadingToast);
        }
        
        console.group('📱 Clock In Response');
        console.log('Server Response:', res);
        console.groupEnd();
        
        if (res.msg == 'SUCCESS') {
          const message = `${res.employee}<br>บันทึกเวลามา ${res.return_date}`;
          
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.success(`ลงเวลาเข้า ${res.return_date} เรียบร้อย`);
            
            // Update status display if available
            if (window.timeTrackerApp && window.timeTrackerApp.statusDisplay) {
              window.timeTrackerApp.updateEmployeeStatus(employee);
            }
          } else {
            $('#message').html(message);
            document.getElementById("message").className = "alert alert-primary";
          }
          
          clearForm();
          
          // Send notification
          if (profile) {
            optimizedAjax({
              method: 'POST',
              url: scripturl + "/sendnotify",
              data: {
                message: res.message,
                token: res.token,
                lat: gps ? gps[0] : null,
                lon: gps ? gps[1] : null,
              }
            }).catch(err => {
              console.warn('📱 Notification failed:', err);
            });
          }
        } else {
          const message = `${res.employee} ${res.msg}`;
          
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.warning(res.msg);
          } else {
            $('#message').html(message);
            document.getElementById("message").className = "alert alert-warning";
          }
          
          clearForm();
        }
      },
      error: function(xhr, status, error) {
        if (loadingToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(loadingToast);
        }
        
        console.error('📱 Clock In Error:', status, error);
        
        // Check if offline
        if (!navigator.onLine) {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.warning('ไม่มีอินเทอร์เน็ต ข้อมูลจะถูกส่งเมื่อออนไลน์');
            // Store for offline sync
            storeOfflineAction('clockin', apiData);
          } else {
            $('#message').html('ไม่มีอินเทอร์เน็ต ข้อมูลจะถูกส่งเมื่อออนไลน์');
            document.getElementById("message").className = "alert alert-warning";
          }
        } else {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.error('เกิดข้อผิดพลาดในการลงเวลาเข้า');
          } else {
            $('#message').html('เกิดข้อผิดพลาดในการส่งข้อมูล');
            document.getElementById("message").className = "alert alert-danger";
          }
        }
        
        clearForm();
      }
    });
  } else {
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.warning('กรุณาเลือกรายชื่อพนักงาน');
    } else {
      $('#message').html('กรุณาเลือกรายชื่อพนักงาน ...!');
      document.getElementById('message').className = 'alert alert-warning text-danger';
    }
    clearForm();
  }
}

// ⭐ Enhanced ClockOut with better mobile UX
function ClockOut() {
  const employee = document.getElementById("employee").value;

  if (employee != '') {
    const loadingToast = typeof MobileUI !== 'undefined' ? 
      MobileUI.toast.loading('กำลังลงเวลาออก...') : null;
    
    if (!loadingToast) {
      $('#message').html("<span class='spinner-border spinner-border-sm text-warning'></span> โปรดรอสักครู่ ...!");
    }
    
    const clientTime = getClientTime();
    
    const apiData = {
      employee,
      lat: gps ? gps[0] : null,
      lon: gps ? gps[1] : null,
      client_time: clientTime
    };
    
    if (profile) {
      apiData.line_name = profile.displayName;
      apiData.line_picture = profile.pictureUrl;
    }
    
    console.group('📱 Clock Out Request');
    console.log('API Data:', apiData);
    console.log('Network Status:', navigator.onLine ? 'Online' : 'Offline');
    console.groupEnd();
    
    optimizedAjax({
      method: 'POST',
      url: scripturl + "/clockout",
      data: apiData,
      timeout: 15000,
      success: function (res) {
        if (loadingToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(loadingToast);
        }
        
        console.group('📱 Clock Out Response');
        console.log('Server Response:', res);
        console.groupEnd();
        
        if (res.msg == 'SUCCESS') {
          const message = `${res.employee}<br>บันทึกเวลากลับ ${res.return_date}`;
          
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.success(`ลงเวลาออก ${res.return_date} เรียบร้อย`);
            
            // Update status display if available
            if (window.timeTrackerApp && window.timeTrackerApp.statusDisplay) {
              window.timeTrackerApp.updateEmployeeStatus(employee);
            }
          } else {
            $('#message').html(message);
            document.getElementById("message").className = "alert alert-primary";
          }
          
          clearForm();
          
          // Send notification
          if (profile) {
            optimizedAjax({
              method: 'POST',
              url: scripturl + "/sendnotify",
              data: {
                message: res.message,
                token: res.token,
                lat: gps ? gps[0] : null,
                lon: gps ? gps[1] : null,
              }
            }).catch(err => {
              console.warn('📱 Notification failed:', err);
            });
          }
        } else {
          const message = `${res.employee} ${res.msg}`;
          
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.warning(res.msg);
          } else {
            $('#message').html(message);
            document.getElementById("message").className = "alert alert-warning";
          }
          
          clearForm();
        }
      },
      error: function(xhr, status, error) {
        if (loadingToast && typeof MobileUI !== 'undefined') {
          MobileUI.toast.hide(loadingToast);
        }
        
        console.error('📱 Clock Out Error:', status, error);
        
        if (!navigator.onLine) {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.warning('ไม่มีอินเทอร์เน็ต ข้อมูลจะถูกส่งเมื่อออนไลน์');
            storeOfflineAction('clockout', apiData);
          } else {
            $('#message').html('ไม่มีอินเทอร์เน็ต ข้อมูลจะถูกส่งเมื่อออนไลน์');
            document.getElementById("message").className = "alert alert-warning";
          }
        } else {
          if (typeof MobileUI !== 'undefined') {
            MobileUI.toast.error('เกิดข้อผิดพลาดในการลงเวลาออก');
          } else {
            $('#message').html('เกิดข้อผิดพลาดในการส่งข้อมูล');
            document.getElementById("message").className = "alert alert-danger";
          }
        }
        
        clearForm();
      }
    });
  } else {
    if (typeof MobileUI !== 'undefined') {
      MobileUI.toast.warning('กรุณาเลือกรายชื่อพนักงาน');
    } else {
      $('#message').html("กรุณาเลือกรายชื่อพนักงาน ...!");
      document.getElementById("message").className = "alert alert-warning text-danger";
    }
    clearForm();
  }
}

// ⭐ Store offline actions for sync later
function storeOfflineAction(type, data) {
  try {
    const offlineActions = JSON.parse(localStorage.getItem('offline_actions') || '[]');
    offlineActions.push({
      type: type,
      data: data,
      timestamp: Date.now(),
      id: Date.now() + Math.random()
    });
    localStorage.setItem('offline_actions', JSON.stringify(offlineActions));
    console.log('📱 Stored offline action:', type);
  } catch (error) {
    console.error('📱 Failed to store offline action:', error);
  }
}

// ⭐ Sync offline actions when online
function syncOfflineActions() {
  if (!navigator.onLine) return;
  
  try {
    const offlineActions = JSON.parse(localStorage.getItem('offline_actions') || '[]');
    if (offlineActions.length === 0) return;
    
    console.log(`📱 Syncing ${offlineActions.length} offline actions...`);
    
    const promises = offlineActions.map(action => {
      const endpoint = action.type === 'clockin' ? '/clockin' : '/clockout';
      
      return optimizedAjax({
        method: 'POST',
        url: scripturl + endpoint,
        data: action.data,
        timeout: 10000
      }).then(() => {
        return action.id; // Return ID for removal
      }).catch(error => {
        console.error('📱 Failed to sync offline action:', error);
        return null;
      });
    });
    
    Promise.allSettled(promises).then(results => {
      const syncedIds = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      
      if (syncedIds.length > 0) {
        // Remove synced actions
        const remainingActions = offlineActions.filter(action => !syncedIds.includes(action.id));
        localStorage.setItem('offline_actions', JSON.stringify(remainingActions));
        
        if (typeof MobileUI !== 'undefined') {
          MobileUI.toast.success(`ส่งข้อมูลออฟไลน์ ${syncedIds.length} รายการเรียบร้อย`);
        }
        
        console.log(`📱 Synced ${syncedIds.length} offline actions`);
      }
    });
    
  } catch (error) {
    console.error('📱 Error syncing offline actions:', error);
  }
}

// ⭐ Enhanced geolocation with timeout and fallback
function getlocation(forceUpdate = false, callback = null) {
  if (!forceUpdate && gps) {
    console.log("📱 Using cached GPS coordinates:", gps);
    if (callback) callback(true);
    return;
  }
  
  if (!navigator.geolocation) {
    console.error("📱 Geolocation not supported");
    if (callback) callback(false);
    return;
  }
  
  const timeoutMs = 8000; // Reduce timeout for mobile
  const options = {
    enableHighAccuracy: true,
    timeout: timeoutMs,
    maximumAge: 30000 // Accept 30s old position
  };
  
  const timeoutId = setTimeout(() => {
    console.warn("📱 Geolocation timeout, trying IP fallback");
    getLocationFromApi(callback);
  }, timeoutMs + 1000);
  
  navigator.geolocation.getCurrentPosition(
    function(position) {
      clearTimeout(timeoutId);
      
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      gps = [lat, lon];
      
      console.log("📱 Geolocation success:", lat, lon);
      locationPermissionGranted = true;
      
      if (callback) callback(true);
    },
    function(error) {
      clearTimeout(timeoutId);
      console.error("📱 Geolocation error:", error.code, error.message);
      
      // Try IP-based location as fallback
      getLocationFromApi(callback);
    },
    options
  );
}

// ⭐ Enhanced IP-based location with better error handling
function getLocationFromApi(callback = null) {
  const apis = [
    'https://ipapi.co/json/',
    'https://ip-api.com/json/',
    'https://ipinfo.io/json'
  ];
  
  let apiIndex = 0;
  
  function tryNextApi() {
    if (apiIndex >= apis.length) {
      console.error("📱 All location APIs failed");
      if (callback) callback(false);
      return;
    }
    
    const api = apis[apiIndex++];
    console.log(`📱 Trying location API: ${api}`);
    
    $.ajax({
      url: api,
      timeout: 5000,
      success: function(data) {
        let lat, lon;
        
        if (data.latitude && data.longitude) {
          lat = data.latitude;
          lon = data.longitude;
        } else if (data.lat && data.lon) {
          lat = data.lat;
          lon = data.lon;
        } else if (data.loc) {
          [lat, lon] = data.loc.split(',').map(Number);
        }
        
        if (lat && lon) {
          gps = [lat, lon];
          console.log("📱 IP location success:", lat, lon);
          if (callback) callback(true);
        } else {
          tryNextApi();
        }
      },
      error: function() {
        console.warn(`📱 API ${api} failed, trying next...`);
        tryNextApi();
      }
    });
  }
  
  tryNextApi();
}

// ฟังก์ชันล้างฟอร์ม (เดิม)
function clearForm() {
  setTimeout(function () {
    document.getElementById('message').innerText = owner;
    document.getElementById("message").className = "alert msgBg";
    document.getElementById("myForm").reset();
  }, 5000);
}

// ฟังก์ชันแสดงเวลา (เดิม แต่เพิ่ม performance optimization)
function showTime() {
  const date = new Date();
  let h = date.getHours();
  let m = date.getMinutes();
  let s = date.getSeconds();
  
  // ควบคุมจุดกระพริบ
  const dot = s % 2 === 1 ? '.' : '\xa0';
  
  // เพิ่ม 0 นำหน้าตัวเลขถ้าจำเป็น
  h = h.toString().padStart(2, '0');
  m = m.toString().padStart(2, '0');
  s = s.toString().padStart(2, '0');
  
  const time = `${h}:${m}:${s}${dot}`;
  const clockElement = document.getElementById("MyClockDisplay");
  
  if (clockElement) {
    clockElement.textContent = time;
  }
  
  // ใช้ requestAnimationFrame แทน setTimeout เพื่อ performance ที่ดีขึ้น
  requestAnimationFrame(() => {
    setTimeout(showTime, 1000);
  });
}

// ⭐ Auto sync offline actions when online
window.addEventListener('online', () => {
  console.log('📱 Device back online, syncing offline actions...');
  setTimeout(syncOfflineActions, 1000); // Wait a bit for connection to stabilize
});

// ⭐ Initial sync check on page load
$(document).ready(function() {
  setTimeout(() => {
    if (navigator.onLine) {
      syncOfflineActions();
    }
  }, 3000); // Wait for app to initialize
});