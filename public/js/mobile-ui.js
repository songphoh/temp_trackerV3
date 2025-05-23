// public/js/mobile-ui.js - UI Components และ UX สำหรับ Mobile

// ⭐ Loading States Manager
class LoadingManager {
  constructor() {
    this.activeLoaders = new Set();
    this.defaultMessages = {
      loading: 'กำลังโหลด...',
      submitting: 'กำลังส่งข้อมูล...',
      fetching: 'กำลังดึงข้อมูล...',
      processing: 'กำลังประมวลผล...'
    };
  }

  show(type = 'loading', message = null) {
    const loaderId = Date.now() + Math.random();
    this.activeLoaders.add(loaderId);
    
    const displayMessage = message || this.defaultMessages[type] || this.defaultMessages.loading;
    
    // Create skeleton loading instead of spinner
    this.createSkeletonLoader(loaderId, displayMessage);
    
    return loaderId;
  }

  hide(loaderId) {
    if (loaderId) {
      this.activeLoaders.delete(loaderId);
      this.removeLoader(loaderId);
    }
  }

  createSkeletonLoader(id, message) {
    // Remove existing loaders first
    this.clearAllLoaders();
    
    const skeleton = document.createElement('div');
    skeleton.id = `skeleton-${id}`;
    skeleton.className = 'skeleton-loader';
    skeleton.innerHTML = `
      <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-text">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
      </div>
      <div class="skeleton-content">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton-message">${message}</div>
    `;
    
    document.body.appendChild(skeleton);
    
    // Animate in
    requestAnimationFrame(() => {
      skeleton.classList.add('visible');
    });
  }

  removeLoader(id) {
    const loader = document.getElementById(`skeleton-${id}`);
    if (loader) {
      loader.classList.add('fadeout');
      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 300);
    }
  }

  clearAllLoaders() {
    document.querySelectorAll('.skeleton-loader').forEach(loader => {
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    });
    this.activeLoaders.clear();
  }
}

// ⭐ Toast Notification System
class ToastManager {
  constructor() {
    this.container = this.createContainer();
    this.toasts = new Map();
    this.queue = [];
    this.maxVisible = 3;
  }

  createContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  show(message, type = 'info', duration = 3000, options = {}) {
    const toastId = Date.now() + Math.random();
    
    const toast = {
      id: toastId,
      message,
      type,
      duration,
      options,
      timestamp: Date.now()
    };

    // Queue if too many visible
    if (this.toasts.size >= this.maxVisible) {
      this.queue.push(toast);
      return toastId;
    }

    this.createToast(toast);
    return toastId;
  }

  createToast(toast) {
    const element = document.createElement('div');
    element.className = `toast toast-${toast.type}`;
    element.id = `toast-${toast.id}`;
    
    // Add icons based on type
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳'
    };
    
    element.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icons[toast.type] || icons.info}</span>
        <span class="toast-message">${toast.message}</span>
        <button class="toast-close" onclick="MobileUI.toast.hide('${toast.id}')">&times;</button>
      </div>
      ${toast.type === 'loading' ? '<div class="toast-progress"></div>' : ''}
    `;

    // Add touch gestures for dismissal
    this.addTouchGestures(element, toast.id);
    
    this.container.appendChild(element);
    this.toasts.set(toast.id, { ...toast, element });

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('visible');
    });

    // Auto-hide (except loading toasts)
    if (toast.type !== 'loading' && toast.duration > 0) {
      setTimeout(() => this.hide(toast.id), toast.duration);
    }
  }

  addTouchGestures(element, toastId) {
    let startX = 0;
    let currentX = 0;
    let threshold = 100;

    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    });

    element.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diffX = currentX - startX;
      
      if (Math.abs(diffX) > 10) {
        element.style.transform = `translateX(${diffX}px)`;
        element.style.opacity = Math.max(0.3, 1 - Math.abs(diffX) / 200);
      }
    });

    element.addEventListener('touchend', () => {
      const diffX = currentX - startX;
      
      if (Math.abs(diffX) > threshold) {
        this.hide(toastId);
      } else {
        // Reset position
        element.style.transform = '';
        element.style.opacity = '';
      }
    });
  }

  hide(toastId) {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    toast.element.classList.add('fadeout');
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(toastId);
      
      // Show next in queue
      if (this.queue.length > 0) {
        const nextToast = this.queue.shift();
        this.createToast(nextToast);
      }
    }, 300);
  }

  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 4000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }

  loading(message) {
    return this.show(message, 'loading', 0);
  }
}

// ⭐ Enhanced Form Handler
class MobileFormHandler {
  constructor() {
    this.forms = new Map();
    this.validators = new Map();
    this.setupGlobalValidators();
  }

  setupGlobalValidators() {
    this.validators.set('required', (value) => {
      return value && value.trim().length > 0 ? null : 'กรุณากรอกข้อมูล';
    });

    this.validators.set('employee', (value) => {
      return value && value.trim().length >= 2 ? null : 'กรุณาเลือกหรือพิมพ์ชื่อพนักงาน';
    });

    this.validators.set('note', (value) => {
      return !value || value.length <= 200 ? null : 'หมายเหตุต้องไม่เกิน 200 ตัวอักษร';
    });
  }

  register(formId, config = {}) {
    const form = document.getElementById(formId);
    if (!form) {
      console.error('📱 Form not found:', formId);
      return;
    }

    const formConfig = {
      validateOnChange: true,
      showErrors: true,
      preventDoubleSubmit: true,
      ...config
    };

    this.forms.set(formId, formConfig);
    this.setupFormHandlers(form, formConfig);
  }

  setupFormHandlers(form, config) {
    // Prevent double submission
    if (config.preventDoubleSubmit) {
      let isSubmitting = false;
      
      form.addEventListener('submit', (e) => {
        if (isSubmitting) {
          e.preventDefault();
          return false;
        }
        isSubmitting = true;
        
        // Reset after 3 seconds
        setTimeout(() => {
          isSubmitting = false;
        }, 3000);
      });
    }

    // Real-time validation
    if (config.validateOnChange) {
      form.addEventListener('input', (e) => {
        this.validateField(e.target);
      });

      form.addEventListener('blur', (e) => {
        this.validateField(e.target);
      }, true);
    }

    // Touch-friendly enhancements
    this.enhanceForTouch(form);
  }

  enhanceForTouch(form) {
    // Larger touch targets for small elements
    const inputs = form.querySelectorAll('input, select, textarea, button');
    inputs.forEach(input => {
      if (!input.classList.contains('touch-enhanced')) {
        input.classList.add('touch-enhanced');
        
        // Auto-zoom prevention for iOS
        if (input.type === 'text' || input.type === 'search') {
          input.style.fontSize = '16px';
        }
      }
    });

    // Smooth scrolling to focused inputs
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        setTimeout(() => {
          input.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 300); // Wait for keyboard animation
      });
    });
  }

  validateField(field) {
    const validators = field.dataset.validators?.split(',') || [];
    const value = field.value;
    let isValid = true;
    let errorMessage = null;

    for (const validatorName of validators) {
      const validator = this.validators.get(validatorName.trim());
      if (validator) {
        const error = validator(value, field);
        if (error) {
          isValid = false;
          errorMessage = error;
          break;
        }
      }
    }

    this.showFieldValidation(field, isValid, errorMessage);
    return isValid;
  }

  showFieldValidation(field, isValid, message) {
    // Remove existing validation
    field.classList.remove('valid', 'invalid');
    
    let errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
      errorElement.remove();
    }

    if (!isValid && message) {
      field.classList.add('invalid');
      
      errorElement = document.createElement('div');
      errorElement.className = 'field-error';
      errorElement.textContent = message;
      field.parentNode.appendChild(errorElement);
      
      // Animate error message
      requestAnimationFrame(() => {
        errorElement.classList.add('visible');
      });
    } else if (isValid && field.value) {
      field.classList.add('valid');
    }
  }

  validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const fields = form.querySelectorAll('[data-validators]');
    let isFormValid = true;

    fields.forEach(field => {
      const fieldValid = this.validateField(field);
      if (!fieldValid) {
        isFormValid = false;
      }
    });

    return isFormValid;
  }

  reset(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.reset();
    
    // Clear validation states
    form.querySelectorAll('.valid, .invalid').forEach(field => {
      field.classList.remove('valid', 'invalid');
    });

    form.querySelectorAll('.field-error').forEach(error => {
      error.remove();
    });
  }
}

// ⭐ Employee Autocomplete Component
class EmployeeAutocomplete {
  constructor(inputId, options = {}) {
    this.input = document.getElementById(inputId);
    this.options = {
      minChars: 2,
      maxResults: 10,
      showCodes: true,
      allowCustom: false,
      placeholder: 'พิมพ์ชื่อหรือรหัสพนักงาน',
      ...options
    };
    
    this.employees = [];
    this.filteredEmployees = [];
    this.selectedIndex = -1;
    this.isVisible = false;
    
    this.init();
  }

  init() {
    if (!this.input) {
      console.error('📱 Autocomplete input not found');
      return;
    }

    this.input.placeholder = this.options.placeholder;
    this.createDropdown();
    this.setupEventListeners();
  }

  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'autocomplete-dropdown';
    this.dropdown.style.display = 'none';
    
    // Position relative to input
    this.input.parentNode.style.position = 'relative';
    this.input.parentNode.appendChild(this.dropdown);
  }

  setupEventListeners() {
    // Input events
    this.input.addEventListener('input', (e) => {
      this.handleInput(e.target.value);
    });

    this.input.addEventListener('focus', () => {
      if (this.input.value.length >= this.options.minChars) {
        this.show();
      }
    });

    this.input.addEventListener('blur', () => {
      // Delay hiding to allow clicks on dropdown
      setTimeout(() => this.hide(), 150);
    });

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.hide();
      }
    });
  }

  handleInput(value) {
    if (value.length < this.options.minChars) {
      this.hide();
      return;
    }

    this.filterEmployees(value);
    this.updateDropdown();
    this.show();
  }

  filterEmployees(query) {
    const lowerQuery = query.toLowerCase();
    
    this.filteredEmployees = this.employees
      .filter(emp => {
        return emp.name.toLowerCase().includes(lowerQuery) ||
               emp.code.toLowerCase().includes(lowerQuery);
      })
      .slice(0, this.options.maxResults);
    
    this.selectedIndex = -1;
  }

  updateDropdown() {
    this.dropdown.innerHTML = '';
    
    if (this.filteredEmployees.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'autocomplete-no-results';
      noResults.textContent = 'ไม่พบข้อมูลพนักงาน';
      this.dropdown.appendChild(noResults);
      return;
    }

    this.filteredEmployees.forEach((emp, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.index = index;
      
      item.innerHTML = `
        <div class="autocomplete-name">${emp.name}</div>
        ${this.options.showCodes ? `<div class="autocomplete-code">${emp.code}</div>` : ''}
      `;
      
      item.addEventListener('click', () => {
        this.selectEmployee(emp);
      });

      this.dropdown.appendChild(item);
    });
  }

  handleKeydown(e) {
    if (!this.isVisible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1, 
          this.filteredEmployees.length - 1
        );
        this.highlightItem();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.highlightItem();
        break;

      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.selectEmployee(this.filteredEmployees[this.selectedIndex]);
        }
        break;

      case 'Escape':
        this.hide();
        break;
    }
  }

  highlightItem() {
    // Remove previous highlight
    this.dropdown.querySelectorAll('.highlighted').forEach(item => {
      item.classList.remove('highlighted');
    });

    // Highlight current
    if (this.selectedIndex >= 0) {
      const items = this.dropdown.querySelectorAll('.autocomplete-item');
      if (items[this.selectedIndex]) {
        items[this.selectedIndex].classList.add('highlighted');
        items[this.selectedIndex].scrollIntoView({
          block: 'nearest'
        });
      }
    }
  }

  selectEmployee(employee) {
    this.input.value = employee.name;
    this.input.dataset.empCode = employee.code;
    this.input.dataset.empName = employee.name;
    
    // Trigger change event
    this.input.dispatchEvent(new CustomEvent('employee-selected', {
      detail: employee
    }));
    
    this.hide();
    
    // Trigger validation
    if (this.input.dataset.validators) {
      this.input.dispatchEvent(new Event('blur'));
    }
  }

  show() {
    this.dropdown.style.display = 'block';
    this.isVisible = true;
    
    requestAnimationFrame(() => {
      this.dropdown.classList.add('visible');
    });
  }

  hide() {
    this.dropdown.classList.remove('visible');
    this.isVisible = false;
    
    setTimeout(() => {
      this.dropdown.style.display = 'none';
    }, 200);
  }

  setEmployees(employees) {
    this.employees = employees;
  }

  getSelectedEmployee() {
    return {
      name: this.input.dataset.empName || this.input.value,
      code: this.input.dataset.empCode || ''
    };
  }

  clear() {
    this.input.value = '';
    this.input.dataset.empCode = '';
    this.input.dataset.empName = '';
    this.hide();
  }
}

// ⭐ Status Display Component
class StatusDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentStatus = null;
    this.updateInterval = null;
  }

  update(status) {
    if (!this.container) return;

    this.currentStatus = status;
    this.render();
    
    // Auto-update for active status
    if (status.status === 'clocked_in') {
      this.startAutoUpdate();
    } else {
      this.stopAutoUpdate();
    }
  }

  render() {
    if (!this.currentStatus) {
      this.container.innerHTML = '<div class="status-empty">ยังไม่มีข้อมูลสถานะ</div>';
      return;
    }

    const { status, message, clock_in_time, clock_out_time, employee_name } = this.currentStatus;
    
    let statusClass = 'status-unknown';
    let statusIcon = '❓';
    let actionText = '';

    switch (status) {
      case 'not_clocked_in':
        statusClass = 'status-not-clocked-in';
        statusIcon = '⏰';
        actionText = 'ยังไม่ได้ลงเวลาเข้า';
        break;
      case 'clocked_in':
        statusClass = 'status-clocked-in';
        statusIcon = '✅';
        actionText = 'ลงเวลาเข้าแล้ว';
        break;
      case 'completed':
        statusClass = 'status-completed';
        statusIcon = '🏁';
        actionText = 'ลงเวลาครบแล้ว';
        break;
    }

    this.container.innerHTML = `
      <div class="status-card ${statusClass}">
        <div class="status-header">
          <span class="status-icon">${statusIcon}</span>
          <span class="status-text">${actionText}</span>
        </div>
        
        ${employee_name ? `
          <div class="status-employee">
            <strong>${employee_name}</strong>
          </div>
        ` : ''}
        
        ${clock_in_time ? `
          <div class="status-times">
            <div class="time-entry">
              <span class="time-label">เข้างาน:</span>
              <span class="time-value">${clock_in_time}</span>
            </div>
            ${clock_out_time ? `
              <div class="time-entry">
                <span class="time-label">ออกงาน:</span>
                <span class="time-value">${clock_out_time}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        ${status === 'clocked_in' ? `
          <div class="working-duration">
            <span id="working-timer">กำลังคำนวณ...</span>
          </div>
        ` : ''}
      </div>
    `;

    if (status === 'clocked_in' && clock_in_time) {
      this.updateWorkingTime();
    }
  }

  updateWorkingTime() {
    const timer = document.getElementById('working-timer');
    if (!timer || !this.currentStatus.clock_in_time) return;

    const clockInTime = this.parseThaiTime(this.currentStatus.clock_in_time);
    if (!clockInTime) return;

    const now = new Date();
    const diff = now - clockInTime;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    timer.textContent = `ทำงานมาแล้ว ${hours} ชั่วโมง ${minutes} นาที`;
  }

  parseThaiTime(timeString) {
    try {
      const today = new Date();
      const [hours, minutes, seconds] = timeString.split(':').map(Number);
      
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hours,
        minutes,
        seconds || 0
      );
    } catch (error) {
      console.error('📱 Error parsing time:', error);
      return null;
    }
  }

  startAutoUpdate() {
    this.stopAutoUpdate();
    this.updateInterval = setInterval(() => {
      this.updateWorkingTime();
    }, 60000); // Update every minute
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  clear() {
    this.currentStatus = null;
    this.stopAutoUpdate();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ⭐ Global UI Manager
class MobileUIManager {
  constructor() {
    this.loading = new LoadingManager();
    this.toast = new ToastManager();
    this.form = new MobileFormHandler();
    this.components = new Map();
    
    this.initializeGlobalUI();
  }

  initializeGlobalUI() {
    // Add mobile-specific classes
    document.body.classList.add('mobile-optimized');
    
    // Setup viewport meta tag if not exists
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1.0, user-scalable=no';
      document.head.appendChild(viewport);
    }

    // Prevent zoom on input focus (iOS)
    this.preventZoomOnInputs();
    
    // Setup haptic feedback
    this.setupHapticFeedback();
    
    // Setup accessibility
    this.setupAccessibility();
  }

  preventZoomOnInputs() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input[type="tel"]');
    inputs.forEach(input => {
      if (parseFloat(getComputedStyle(input).fontSize) < 16) {
        input.style.fontSize = '16px';
      }
    });
  }

  setupHapticFeedback() {
    if ('vibrate' in navigator) {
      // Add haptic feedback to buttons
      document.addEventListener('click', (e) => {
        if (e.target.matches('button, .btn, .clickable')) {
          navigator.vibrate(10); // Light haptic feedback
        }
      });
    }
  }

  setupAccessibility() {
    // Improve focus visibility
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
      }
    });

    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-navigation');
    });
  }

  // Component factory methods
  createAutocomplete(inputId, options) {
    const autocomplete = new EmployeeAutocomplete(inputId, options);
    this.components.set(inputId, autocomplete);
    return autocomplete;
  }

  createStatusDisplay(containerId) {
    const statusDisplay = new StatusDisplay(containerId);
    this.components.set(containerId, statusDisplay);
    return statusDisplay;
  }

  getComponent(id) {
    return this.components.get(id);
  }

  removeComponent(id) {
    const component = this.components.get(id);
    if (component && typeof component.destroy === 'function') {
      component.destroy();
    }
    this.components.delete(id);
  }
}

// Initialize global instances
const loadingManager = new LoadingManager();
const toastManager = new ToastManager();
const formHandler = new MobileFormHandler();
const uiManager = new MobileUIManager();

// Export for global use
window.MobileUI = {
  LoadingManager,
  ToastManager,
  MobileFormHandler,
  EmployeeAutocomplete,
  StatusDisplay,
  MobileUIManager,
  // Global instances
  loading: loadingManager,
  toast: toastManager,
  form: formHandler,
  ui: uiManager
};