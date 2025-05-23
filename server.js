// server.js - Mobile Time Tracker Server (ส่วนที่ 1/8)
// Dependencies และ Initial Setup

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ⭐ Core Dependencies
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const path = require('path');
const axios = require('axios');

// ⭐ Security & Performance Dependencies
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

// ⭐ Database Connection (ใช้ optimized pool)
const db = require('./db-pool-optimized');

// ⭐ Environment Setup
process.env.TZ = 'Asia/Bangkok';

console.log('🚀 Starting Mobile Time Tracker Server...');
console.log('Server Timezone:', process.env.TZ);
console.log('Current server time:', new Date().toString());
console.log('Current server time (ISO):', new Date().toISOString());
console.log('Current server time (Locale):', new Date().toLocaleString('th-TH'));
console.log('Environment:', process.env.NODE_ENV || 'development');

// ⭐ Express App Configuration
const app = express();
const port = process.env.PORT || 3000;

// ⭐ Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // ปิดเพื่อให้ PWA ทำงานได้
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ⭐ Mobile Client Detection Middleware
app.use((req, res, next) => {
  const isMobile = req.headers['x-mobile-client'] === 'true' || 
                   /Mobile|Android|iPhone|iPad/i.test(req.headers['user-agent'] || '');
  
  req.isMobile = isMobile;
  
  // เพิ่ม headers สำหรับ Mobile PWA
  if (isMobile) {
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes cache
      'X-Mobile-Optimized': 'true',
      'X-Content-Type-Options': 'nosniff'
    });
  }
  
  next();
});

// ⭐ Compression Middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// ⭐ Performance Monitoring Middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 2000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.url} took ${duration}ms`);
    } else if (duration > 1000) {
      console.log(`⚠️ Long request: ${req.method} ${req.url} took ${duration}ms`);
    }
  });
  
  next();
});

// ⭐ Debug Router
const debugRouter = require('./debug');
app.use('/debug', debugRouter);

// ⭐ CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://your-domain.com', // เปลี่ยนเป็น domain จริง
      'capacitor://localhost', // สำหรับ Capacitor apps
      'ionic://localhost' // สำหรับ Ionic apps
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // อนุญาตทุก origin ใน development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Mobile-Client']
};

app.use(cors(corsOptions));

// ⭐ Body Parser Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ⭐ Static Files Serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// ⭐ PWA Static Files
app.use('/manifest.json', express.static(path.join(__dirname, 'public', 'manifest.json')));
app.use('/sw.js', express.static(path.join(__dirname, 'public', 'sw.js')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));

// ⭐ Request Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// ⭐ Security Headers Middleware
app.use((req, res, next) => {
  // Security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  
  // PWA specific headers
  if (req.path === '/manifest.json') {
    res.set('Content-Type', 'application/manifest+json');
  }
  
  if (req.path === '/sw.js') {
    res.set({
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/'
    });
  }
  
  next();
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 2/8)
// Rate Limiting และ Cache Setup

// ⭐ Rate Limiting Configuration
const mobileApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // จำกัด 100 requests ต่อ 15 นาที
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // ไม่จำกัดสำหรับ health check
    return req.path === '/health' || req.path === '/metrics';
  }
});

const clockActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // จำกัด 10 requests ต่อ 5 นาที
  message: {
    success: false,
    message: 'Too many clock actions, please wait before trying again.'
  },
  keyGenerator: (req) => {
    // ใช้ employee name + IP เป็น key
    return `${req.body.employee || 'unknown'}-${req.ip}`;
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // จำกัด 50 requests ต่อ 15 นาที สำหรับ admin
  message: {
    success: false,
    message: 'Too many admin requests, please try again later.'
  }
});

// ⭐ Apply Rate Limiting
app.use('/api/mobile', mobileApiLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/clockin', clockActionLimiter);
app.use('/api/clockout', clockActionLimiter);

// ⭐ Cache Configuration สำหรับข้อมูลที่ไม่เปลี่ยนแปลงบ่อย
let employeeCache = null;
let employeeCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 นาที

// ⭐ Mobile Performance Cache
let mobilePerf = {
  apiCache: new Map(),
  requestQueue: [],
  isProcessing: false,
  retryCount: 0,
  maxRetries: 3
};

// ⭐ Employee Cache Functions
async function getEmployeesFromCache() {
  const now = Date.now();
  if (!employeeCache || (now - employeeCacheTime) > CACHE_DURATION) {
    console.log('🔄 Refreshing employee cache...');
    
    try {
      const result = await db.executePrepared('GET_ACTIVE_EMPLOYEES', ['active']);
      employeeCache = result.rows.map(e => [e.full_name, e.emp_code]);
      employeeCacheTime = now;
      console.log(`📋 Cached ${employeeCache.length} employees`);
    } catch (error) {
      console.error('❌ Error refreshing employee cache:', error);
      // ใช้ cache เก่าถ้ามี
      if (!employeeCache) {
        employeeCache = [];
      }
    }
  }
  return employeeCache;
}

// ⭐ ฟังก์ชันล้าง cache
function clearEmployeeCache() {
  employeeCache = null;
  employeeCacheTime = 0;
  console.log('🧹 Employee cache cleared');
}

// ⭐ API Cache Helper Functions
function setApiCache(key, data, ttl = 30000) {
  mobilePerf.apiCache.set(key, {
    data,
    expires: Date.now() + ttl
  });
}

function getApiCache(key) {
  const cached = mobilePerf.apiCache.get(key);
  if (!cached) return null;
  
  if (Date.now() > cached.expires) {
    mobilePerf.apiCache.delete(key);
    return null;
  }
  
  return cached.data;
}

function clearApiCache() {
  mobilePerf.apiCache.clear();
  console.log('🧹 API cache cleared');
}

// ⭐ Cleanup Old Cache Entries
function cleanupOldCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of mobilePerf.apiCache.entries()) {
    if (now > value.expires) {
      mobilePerf.apiCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
  }
}

// รัน cache cleanup ทุก 5 นาที
setInterval(cleanupOldCache, 5 * 60 * 1000);

// server.js - Mobile Time Tracker Server (ส่วนที่ 3/8)
// Database Initialization และ Helper Functions

// ⭐ เตรียมฐานข้อมูล
async function initializeDatabase() {
  console.log('🚀 กำลังตรวจสอบและสร้างตาราง...');
  
  try {
    await db.withTransaction(async (client) => {
      // สร้างตาราง employees
      await client.query(`
        CREATE TABLE IF NOT EXISTS employees (
          id SERIAL PRIMARY KEY,
          emp_code TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          position TEXT,
          department TEXT,
          line_id TEXT,
          line_name TEXT,
          line_picture TEXT,
          status TEXT DEFAULT 'active',
          mobile_enabled BOOLEAN DEFAULT true,
          last_mobile_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ ตาราง employees สร้างหรือมีอยู่แล้ว');

      // สร้างตาราง time_logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS time_logs (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL,
          clock_in TIMESTAMP,
          clock_out TIMESTAMP,
          note TEXT,
          latitude_in REAL,
          longitude_in REAL,
          latitude_out REAL,
          longitude_out REAL,
          line_id TEXT,
          line_name TEXT,
          line_picture TEXT,
          status TEXT DEFAULT 'normal',
          sync_status TEXT DEFAULT 'synced',
          mobile_device_id TEXT,
          app_version TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
      `);
      console.log('✅ ตาราง time_logs สร้างหรือมีอยู่แล้ว');

      // สร้างตาราง settings
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          setting_name TEXT NOT NULL UNIQUE,
          setting_value TEXT,
          description TEXT
        )
      `);
      console.log('✅ ตาราง settings สร้างหรือมีอยู่แล้ว');

      // ⭐ สร้าง indexes สำหรับ Mobile performance
      await client.query(`
        -- Index สำหรับการค้นหาพนักงาน
        CREATE INDEX IF NOT EXISTS idx_employees_emp_code ON employees(emp_code);
        CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
        CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
        CREATE INDEX IF NOT EXISTS idx_employees_search ON employees(LOWER(full_name), LOWER(emp_code)) WHERE status = 'active';
        
        -- Index สำหรับการค้นหา time logs
        CREATE INDEX IF NOT EXISTS idx_time_logs_employee_id ON time_logs(employee_id);
        CREATE INDEX IF NOT EXISTS idx_time_logs_clock_in_date ON time_logs(DATE(clock_in));
        CREATE INDEX IF NOT EXISTS idx_time_logs_employee_date ON time_logs(employee_id, DATE(clock_in));
        CREATE INDEX IF NOT EXISTS idx_time_logs_employee_today ON time_logs(employee_id, DATE(clock_in), clock_in DESC);
        CREATE INDEX IF NOT EXISTS idx_time_logs_status_check ON time_logs(employee_id, clock_in DESC) WHERE clock_out IS NULL;
        
        -- Index สำหรับ settings
        CREATE INDEX IF NOT EXISTS idx_settings_name ON settings(setting_name);
      `);
      
      console.log('✅ Database tables and indexes created');
    });
    
    await addInitialSettings();
    await addSampleEmployees();
    
    console.log('✅ เตรียมฐานข้อมูลเสร็จสมบูรณ์');
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
    throw err;
  }
}

// ⭐ เพิ่มข้อมูลการตั้งค่าเริ่มต้น
async function addInitialSettings() {
  try {
    const countResult = await db.query('SELECT COUNT(*) as count FROM settings');
    
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log('📝 กำลังเพิ่มการตั้งค่าเริ่มต้น...');
      
      const settings = [
        { name: 'organization_name', value: 'องค์การบริหารส่วนตำบลหัวนา', desc: 'ชื่อหน่วยงาน' },
        { name: 'work_start_time', value: '08:30', desc: 'เวลาเริ่มงาน' },
        { name: 'work_end_time', value: '16:30', desc: 'เวลาเลิกงาน' },
        { name: 'allowed_ip', value: '', desc: 'IP Address ที่อนุญาต' },
        { name: 'telegram_bot_token', value: '', desc: 'Token สำหรับ Telegram Bot' },
        { name: 'telegram_groups', value: '[{"name":"กลุ่มหลัก","chat_id":"","active":true}]', desc: 'กลุ่มรับการแจ้งเตือน Telegram' },
        { name: 'notify_clock_in', value: '1', desc: 'แจ้งเตือนเมื่อลงเวลาเข้า' },
        { name: 'notify_clock_out', value: '1', desc: 'แจ้งเตือนเมื่อลงเวลาออก' },
        { name: 'admin_username', value: 'admin', desc: 'ชื่อผู้ใช้สำหรับแอดมิน' },
        { name: 'admin_password', value: 'admin123', desc: 'รหัสผ่านสำหรับแอดมิน' },
        { name: 'liff_id', value: '2001032478-VR5Akj0k', desc: 'LINE LIFF ID' },
        { name: 'time_offset', value: '420', desc: 'ค่าชดเชยเวลา (นาที)' },
        { name: 'gas_web_app_url', value: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', desc: 'URL ของ Google Apps Script Web App' },
        { name: 'use_gas_for_telegram', value: '1', desc: 'ใช้ Google Apps Script สำหรับส่งข้อความไป Telegram (1=ใช้, 0=ไม่ใช้)' },
        { name: 'mobile_app_version', value: '1.0.0', desc: 'เวอร์ชันของ Mobile App' },
        { name: 'enable_offline_mode', value: '1', desc: 'เปิดใช้งาน Offline Mode' },
        { name: 'require_location', value: '1', desc: 'บังคับใช้ตำแหน่ง GPS' }
      ];
      
      for (const setting of settings) {
        await db.query(
          'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3)',
          [setting.name, setting.value, setting.desc]
        );
      }
      
      console.log('✅ เพิ่มการตั้งค่าเริ่มต้นเรียบร้อยแล้ว');
    } else {
      // เพิ่ม settings ใหม่หากยังไม่มี
      const newSettings = [
        { name: 'mobile_app_version', value: '1.0.0', desc: 'เวอร์ชันของ Mobile App' },
        { name: 'enable_offline_mode', value: '1', desc: 'เปิดใช้งาน Offline Mode' },
        { name: 'require_location', value: '1', desc: 'บังคับใช้ตำแหน่ง GPS' }
      ];
      
      for (const setting of newSettings) {
        const checkResult = await db.query('SELECT setting_name FROM settings WHERE setting_name = $1', [setting.name]);
        
        if (checkResult.rows.length === 0) {
          await db.query(
            'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3)',
            [setting.name, setting.value, setting.desc]
          );
          console.log(`✅ เพิ่มการตั้งค่า ${setting.name} เรียบร้อยแล้ว`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error adding initial settings:', err.message);
    throw err;
  }
}

// ⭐ เพิ่มข้อมูลพนักงานตัวอย่าง
async function addSampleEmployees() {
  try {
    const countResult = await db.query('SELECT COUNT(*) as count FROM employees');
    
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log('👥 กำลังเพิ่มพนักงานตัวอย่าง...');
      
      const employees = [
        { code: '001', name: 'สมชาย ใจดี', position: 'ผู้จัดการ', department: 'บริหาร' },
        { code: '002', name: 'สมหญิง รักเรียน', position: 'เจ้าหน้าที่', department: 'ธุรการ' }
      ];
      
      for (const emp of employees) {
        await db.query(
          'INSERT INTO employees (emp_code, full_name, position, department, mobile_enabled) VALUES ($1, $2, $3, $4, $5)',
          [emp.code, emp.name, emp.position, emp.department, true]
        );
      }
      
      console.log('✅ เพิ่มพนักงานตัวอย่างเรียบร้อยแล้ว');
    }
  } catch (err) {
    console.error('❌ Error adding sample employees:', err.message);
    throw err;
  }
}

// ⭐ Helper Functions
function adjustClientTime(clientTime) {
  try {
    const clientDate = new Date(clientTime);
    if (isNaN(clientDate.getTime())) {
      return new Date().toISOString();
    }
    return clientDate.toISOString();
  } catch (error) {
    console.error('❌ Error adjusting client time:', error);
    return new Date().toISOString();
  }
}

function processAdminDateTime(timeString) {
  if (!timeString) return null;
  
  console.log('🕐 Processing admin time input:', timeString);
  
  try {
    let resultDate;
    
    // กรณี datetime-local จาก HTML input
    if (timeString.includes('T') && timeString.length === 16) {
      const fullDateTime = timeString + ':00';
      resultDate = new Date(fullDateTime);
      
      if (isNaN(resultDate.getTime())) {
        throw new Error('Invalid date object created');
      }
      
      // แปลงเป็น UTC โดยลบ 7 ชั่วโมง
      const utcDate = new Date(resultDate.getTime() - (7 * 60 * 60 * 1000));
      return utcDate.toISOString();
    }
    
    // กรณีที่มี timezone info แล้ว
    if (timeString.includes('Z') || timeString.includes('+') || timeString.includes('-')) {
      resultDate = new Date(timeString);
      if (isNaN(resultDate.getTime())) {
        throw new Error('Invalid date with timezone info');
      }
      return resultDate.toISOString();
    }
    
    // กรณีอื่นๆ
    resultDate = new Date(timeString);
    if (isNaN(resultDate.getTime())) {
      throw new Error('Cannot parse date string: ' + timeString);
    }
    
    const utcDate = new Date(resultDate.getTime() - (7 * 60 * 60 * 1000));
    return utcDate.toISOString();
    
  } catch (error) {
    console.error('❌ Error processing time:', error.message);
    const fallbackTime = new Date().toISOString();
    console.log('🆘 Using fallback time (current time):', fallbackTime);
    return fallbackTime;
  }
}

function calculateDuration(startDate, endDate) {
  const diff = Math.abs(endDate - startDate);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} ชั่วโมง ${minutes} นาที`;
}

// ⭐ เรียกใช้ฟังก์ชันเตรียมฐานข้อมูล
initializeDatabase().catch(error => {
  console.error('❌ Failed to initialize database:', error);
  process.exit(1);
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 4/8)
// Original API Routes (เดิม)

// ⭐ API - ดึงรายชื่อพนักงานสำหรับ autocomplete (ใช้ cache)
app.post('/api/getdata', async (req, res) => {
  console.log('📋 API: getdata - ดึงรายชื่อพนักงานสำหรับ autocomplete');
  
  try {
    const result = await db.executePrepared('GET_EMPLOYEE_NAMES', ['active']);
    const names = result.rows.map(e => e.full_name);
    res.json(names);
  } catch (err) {
    console.error('❌ Error in getdata:', err.message);
    return res.json({ error: err.message });
  }
});

// ⭐ API - ดึงรายชื่อพนักงานทั้งหมด (ใช้ cache)
app.post('/api/getemployee', async (req, res) => {
  console.log('👥 API: getemployee - ดึงรายชื่อพนักงานทั้งหมด');
  
  try {
    const employees = await getEmployeesFromCache();
    res.json(employees);
  } catch (err) {
    console.error('❌ Error in getemployee:', err.message);
    return res.json({ error: err.message });
  }
});

// ⭐ API - บันทึกเวลาเข้า (ปรับปรุงประสิทธิภาพ)
app.post('/api/clockin', async (req, res) => {
  console.log('⏰ API: clockin - บันทึกเวลาเข้า', req.body);
  
  try {
    const { 
      employee, 
      userinfo, 
      lat, 
      lon, 
      line_name, 
      line_picture, 
      client_time 
    } = req.body;
    
    if (!employee) {
      return res.json({ msg: 'กรุณาระบุชื่อพนักงาน' });
    }
    
    // ใช้ prepared statement
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ msg: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    // ตรวจสอบการลงเวลาซ้ำ
    const checkExistingResult = await db.executePrepared('CHECK_CLOCK_IN_TODAY', [emp.id, today]);
    
    if (checkExistingResult.rows.length > 0) {
      return res.json({ 
        msg: 'คุณได้ลงเวลาเข้าแล้ววันนี้', 
        employee
      });
    }
    
    const now = client_time ? adjustClientTime(client_time) : new Date().toISOString();
    
    // บันทึกเวลาเข้า
    await db.executePrepared('INSERT_TIME_LOG', [
      emp.id, now, userinfo || null, lat || null, lon || null, line_name || null, line_picture || null
    ]);
    
    // ส่งแจ้งเตือน (ไม่รอผลลัพธ์)
    setImmediate(async () => {
      try {
        await sendNotification('clock_in', employee, now, userinfo, lat, lon, line_name);
      } catch (error) {
        console.error('❌ Notification error:', error);
      }
    });
    
    // ปรับเวลาเป็นเวลาไทย
    const date = new Date(now);
    const hours = String(date.getUTCHours() + 7).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const returnDate = `${hours}:${minutes}:${seconds}`;
    
    return res.json({
      msg: 'SUCCESS',
      employee,
      return_date: returnDate,
      return_date_utc: now
    });
  } catch (error) {
    console.error('❌ Error in clockin:', error);
    return res.json({ msg: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - บันทึกเวลาออก (ปรับปรุงประสิทธิภาพ)
app.post('/api/clockout', async (req, res) => {
  console.log('🏃 API: clockout - บันทึกเวลาออก', req.body);
  
  try {
    const { 
      employee, 
      lat, 
      lon, 
      line_name, 
      line_picture, 
      client_time 
    } = req.body;
    
    if (!employee) {
      return res.json({ msg: 'กรุณาระบุชื่อพนักงาน' });
    }
    
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ msg: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    const recordResult = await db.executePrepared('GET_TODAY_RECORD', [emp.id, today]);
    
    if (recordResult.rows.length === 0) {
      return res.json({ 
        msg: 'คุณยังไม่ได้ลงเวลาเข้าวันนี้', 
        employee
      });
    }
    
    const record = recordResult.rows[0];
    
    if (record.clock_out) {
      return res.json({ 
        msg: 'คุณได้ลงเวลาออกแล้ววันนี้', 
        employee
      });
    }
    
    const now = client_time ? adjustClientTime(client_time) : new Date().toISOString();
    
    // บันทึกเวลาออก
    await db.executePrepared('UPDATE_CLOCK_OUT', [
      now, lat || null, lon || null, line_name || null, line_picture || null, record.id
    ]);
    
    // ส่งแจ้งเตือน (ไม่รอผลลัพธ์)
    setImmediate(async () => {
      try {
        await sendNotification('clock_out', employee, now, null, lat, lon, line_name);
      } catch (error) {
        console.error('❌ Notification error:', error);
      }
    });
    
    const date = new Date(now);
    const hours = String(date.getUTCHours() + 7).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const returnDate = `${hours}:${minutes}:${seconds}`;
    
    return res.json({
      msg: 'SUCCESS',
      employee,
      return_date: returnDate,
      return_date_utc: now
    });
  } catch (error) {
    console.error('❌ Error in clockout:', error);
    return res.json({ msg: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - ส่งแจ้งเตือน Telegram
app.post('/api/sendnotify', async (req, res) => {
  console.log('📢 API: sendnotify - ส่งแจ้งเตือน Telegram', req.body);
  
  try {
    const { message, token, chat_id, lat, lon } = req.body;
    
    if (!token || !chat_id || !message) {
      return res.json({ success: false, msg: 'ข้อมูลไม่ครบถ้วน' });
    }
    
    let notifyMessage = message;
    
    if (lat && lon) {
      notifyMessage += `\nพิกัด: https://www.google.com/maps?q=${lat},${lon}`;
    }
    
    console.log('Sending Telegram message:', notifyMessage);
    
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chat_id,
          text: notifyMessage
        },
        { timeout: 10000 }
      );
      
      console.log('Telegram response:', response.data);
      res.json({ success: true });
    } catch (error) {
      console.error('Error sending Telegram message:', error.response?.data || error.message);
      res.json({ success: false, error: error.response?.data?.message || error.message });
    }
  } catch (error) {
    console.error('Error in sendnotify:', error);
    res.json({ success: false, error: error.message });
  }
});

// API - ดึง LIFF ID
app.get('/api/getLiffId', async (req, res) => {
  console.log('API: getLiffId - ดึง LIFF ID');
  
  try {
    const result = await db.query(
      'SELECT setting_value FROM settings WHERE setting_name = $1',
      ['liff_id']
    );
    
    if (result.rows.length > 0) {
      return res.json({ success: true, liffId: result.rows[0].setting_value });
    } else {
      // ถ้าไม่พบ LIFF ID ในฐานข้อมูล ให้ใช้ค่าเริ่มต้น
      return res.json({ success: true, liffId: '2001032478-VR5Akj0k' });
    }
  } catch (error) {
    console.error('Error getting LIFF ID:', error);
    return res.json({ success: false, error: error.message });
  }
});

// เพิ่ม API สำหรับดึงค่าชดเชยเวลา
app.get('/api/getTimeOffset', async (req, res) => {
  console.log('API: getTimeOffset - ดึงค่าชดเชยเวลา');
  
  try {
    const result = await db.query(
      'SELECT setting_value FROM settings WHERE setting_name = $1',
      ['time_offset']
    );
    
    if (result.rows.length > 0) {
      return res.json({ success: true, time_offset: result.rows[0].setting_value });
    } else {
      // ถ้าไม่พบค่าชดเชยเวลาในฐานข้อมูล ให้ใช้ค่าเริ่มต้น
      return res.json({ success: true, time_offset: 420 }); // ตั้งค่าเริ่มต้นเป็น 7 ชั่วโมง (420 นาที)
    }
  } catch (error) {
    console.error('Error getting time offset:', error);
    return res.json({ success: false, error: error.message });
  }
});

// API สำหรับตั้งค่า URL ของ Google Apps Script
app.post('/api/admin/set-gas-url', async (req, res) => {
  console.log('🔧 API: admin/set-gas-url - ตั้งค่า URL ของ GSA', req.body);
  
  try {
    const { gas_url } = req.body;
    
    if (!gas_url) {
      return res.json({ success: false, message: 'กรุณาระบุ URL' });
    }
    
    await db.query(
      'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3) ON CONFLICT (setting_name) DO UPDATE SET setting_value = $2',
      ['gas_web_app_url', gas_url, 'URL ของ Google Apps Script Web App']
    );
    
    console.log('GAS URL updated:', gas_url);
    res.json({ success: true, message: 'บันทึก URL เรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error setting GAS URL:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - ทดสอบการส่งข้อความผ่าน GSA
app.post('/api/admin/test-gas', async (req, res) => {
  console.log('🧪 API: admin/test-gas - ทดสอบการส่งข้อความผ่าน GSA', req.body);
  
  try {
    const { message, lat, lon, gasUrl } = req.body;
    
    if (!message) {
      return res.json({ success: false, message: 'กรุณาระบุข้อความ' });
    }
    
    let useGasUrl = gasUrl;
    
    if (!useGasUrl) {
      const gasUrlResult = await db.query(
        'SELECT setting_value FROM settings WHERE setting_name = $1',
        ['gas_web_app_url']
      );
      
      if (gasUrlResult.rows.length === 0 || !gasUrlResult.rows[0].setting_value) {
        return res.json({ success: false, message: 'ไม่พบ URL ของ GSA กรุณาตั้งค่าก่อน' });
      }
      
      useGasUrl = gasUrlResult.rows[0].setting_value.trim();
    } else {
      useGasUrl = useGasUrl.trim();
    }
    
    if (!useGasUrl.startsWith('https://')) {
      return res.json({ success: false, message: 'URL ของ GSA ต้องขึ้นต้นด้วย https://' });
    }
    
    console.log('ใช้ URL GSA สำหรับทดสอบ:', useGasUrl);
    
    const [tokenResult, groupsResult] = await Promise.all([
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['telegram_bot_token']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['telegram_groups'])
    ]);
    
    if (tokenResult.rows.length === 0 || !tokenResult.rows[0].setting_value) {
      return res.json({ success: false, message: 'ไม่พบ Token ของ Telegram กรุณาตั้งค่าก่อน' });
    }
    
    if (groupsResult.rows.length === 0 || !groupsResult.rows[0].setting_value) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลกลุ่ม Telegram กรุณาตั้งค่าก่อน' });
    }
    
    const token = tokenResult.rows[0].setting_value;
    const groups = JSON.parse(groupsResult.rows[0].setting_value);
    const activeGroup = groups.find(g => g.active && g.chat_id);
    
    if (!activeGroup) {
      return res.json({ success: false, message: 'ไม่พบกลุ่ม Telegram ที่เปิดใช้งาน' });
    }
    
    const jsonData = {
      message: message,
      chatId: activeGroup.chat_id,
      token: token
    };
    
    if (lat && lon) {
      jsonData.lat = lat;
      jsonData.lon = lon;
    }
    
    console.log('ข้อมูลที่ส่งไป GSA:', JSON.stringify(jsonData));
    
    const encodedData = encodeURIComponent(JSON.stringify(jsonData));
    const urlWithParams = `${useGasUrl}?opt=sendToTelegram&data=${encodedData}`;
    
    console.log('URL ที่เรียก:', urlWithParams);
    
    const response = await axios.get(urlWithParams, { timeout: 15000 });
    
    console.log('การตอบกลับจาก GSA:', response.data);
    res.json({ 
      success: true, 
      message: 'ส่งข้อความทดสอบเรียบร้อยแล้ว', 
      response: response.data 
    });
  } catch (error) {
    console.error('Error testing GAS:', error);
    console.error('Error details:', error.response?.data || error);
    res.json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาด: ' + error.message,
      error: error.response?.data || error.message
    });
  }
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 5/8)
// Admin API Routes (เดิม)

// --- API สำหรับระบบแอดมิน ---

// ตรวจสอบการเข้าสู่ระบบแอดมิน
app.post('/api/admin/login', async (req, res) => {
  console.log('🔐 API: admin/login - ตรวจสอบการเข้าสู่ระบบแอดมิน', req.body);
  
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    
    console.log(`Login attempt: ${username}`);
    
    // ตรวจสอบด้วยค่าเริ่มต้น admin/admin123 ก่อน
    if (username === 'admin' && password === 'admin123') {
      console.log('Admin login successful with default credentials');
      return res.json({ success: true });
    }
    
    // ตรวจสอบกับข้อมูลในฐานข้อมูล
    const [adminUserResult, adminPassResult] = await Promise.all([
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['admin_username']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['admin_password'])
    ]);
    
    if (adminUserResult.rows.length === 0 || adminPassResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลผู้ดูแลระบบ' });
    }
    
    if (username === adminUserResult.rows[0].setting_value && 
        password === adminPassResult.rows[0].setting_value) {
      console.log('Admin login successful with database credentials');
      return res.json({ success: true });
    }
    
    console.log('Admin login failed: invalid credentials');
    return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  } catch (error) {
    console.error('Error in admin login:', error);
    return res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - ดึงข้อมูลการลงเวลาทั้งหมด (ปรับปรุงประสิทธิภาพ)
app.get('/api/admin/time-logs', async (req, res) => {
  console.log('📊 API: admin/time-logs - ดึงข้อมูลการลงเวลาทั้งหมด', req.query);
  
  try {
    const { from_date, to_date, employee_id, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT t.id, e.emp_code, e.full_name, e.position, e.department, 
             t.clock_in, t.clock_out, t.note, t.status,
             t.latitude_in, t.longitude_in, t.latitude_out, t.longitude_out
      FROM time_logs t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (from_date) {
      query += ` AND DATE(t.clock_in) >= $${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND DATE(t.clock_in) <= $${paramIndex++}`;
      params.push(to_date);
    }
    
    if (employee_id) {
      query += ` AND t.employee_id = $${paramIndex++}`;
      params.push(employee_id);
    }
    
    query += ` ORDER BY t.clock_in DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    console.log('Running query:', query, 'with params:', params);
    
    const result = await db.query(query, params);
    
    console.log(`Found ${result.rows.length} time logs`);
    
    // ปรับรูปแบบวันที่เวลาให้อ่านง่าย
    const formattedLogs = result.rows.filter(log => log && log.clock_in).map(log => {
      const clockInDate = new Date(new Date(log.clock_in).getTime() + (7 * 60 * 60 * 1000));
      const clockOutDate = log.clock_out ? new Date(new Date(log.clock_out).getTime() + (7 * 60 * 60 * 1000)) : null;
      
      return {
        ...log,
        clock_in_date: clockInDate.toLocaleDateString('th-TH'),
        clock_in_time: clockInDate.toLocaleTimeString('th-TH'),
        clock_out_date: clockOutDate ? clockOutDate.toLocaleDateString('th-TH') : '',
        clock_out_time: clockOutDate ? clockOutDate.toLocaleTimeString('th-TH') : '',
        duration: clockOutDate ? calculateDuration(new Date(log.clock_in), new Date(log.clock_out)) : ''
      };
    });
    
    res.json({ success: true, logs: formattedLogs });
  } catch (error) {
    console.error('Error getting time logs:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - ดึงข้อมูลพนักงานทั้งหมด (ปรับปรุงประสิทธิภาพ)
app.get('/api/admin/employees', async (req, res) => {
  console.log('👥 API: admin/employees - ดึงข้อมูลพนักงานทั้งหมด');
  
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT id, emp_code, full_name, position, department, 
             line_id, line_name, status, mobile_enabled, created_at
      FROM employees
      ORDER BY emp_code
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    console.log(`Found ${result.rows.length} employees`);
    res.json({ success: true, employees: result.rows });
  } catch (error) {
    console.error('Error getting employees:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - เพิ่มข้อมูลการลงเวลาใหม่ (ปรับปรุงประสิทธิภาพ)
app.post('/api/admin/time-logs', async (req, res) => {
  console.log('➕ API: admin/time-logs POST - เพิ่มข้อมูลการลงเวลาใหม่', req.body);
  
  try {
    const { employee_id, clock_in, clock_out, note, skip_notification } = req.body;
    
    if (!employee_id || !clock_in) {
      return res.json({ success: false, message: 'กรุณาระบุข้อมูลที่จำเป็น' });
    }
    
    const empResult = await db.query('SELECT id, full_name FROM employees WHERE id = $1', [employee_id]);
    
    if (empResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const employee = empResult.rows[0];
    
    console.log('🚀 Starting time processing...');
    
    const adjustedClockIn = processAdminDateTime(clock_in);
    const adjustedClockOut = clock_out ? processAdminDateTime(clock_out) : null;
    
    console.log('✅ Time processing completed');
    console.log('📊 Final times for database:');
    console.log('   Clock In (UTC):', adjustedClockIn);
    console.log('   Clock Out (UTC):', adjustedClockOut);
    
    const insertQuery = `
      INSERT INTO time_logs (employee_id, clock_in, clock_out, note, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    
    const result = await db.query(insertQuery, [
      employee_id, 
      adjustedClockIn, 
      adjustedClockOut, 
      note || null,
      'manual'
    ]);
    
    const newId = result.rows[0].id;
    console.log(`✅ Added new time log with ID: ${newId}`);
    
    // ส่งแจ้งเตือนถ้าไม่ได้ข้ามการแจ้งเตือน
    if (!skip_notification) {
      setImmediate(async () => {
        try {
          const notifySettingResult = await db.query(
            'SELECT setting_value FROM settings WHERE setting_name = $1',
            ['notify_clock_in']
          );
          
          if (notifySettingResult.rows.length > 0 && notifySettingResult.rows[0].setting_value === '1') {
            const clockInForNotify = new Date(adjustedClockIn);
            const thaiTimeForNotify = new Date(clockInForNotify.getTime() + (7 * 60 * 60 * 1000));
            
            const thaiDate = thaiTimeForNotify.toLocaleDateString('th-TH');
            const timeStr = thaiTimeForNotify.toLocaleTimeString('th-TH');
            
            let message =
              `⏱ ลงเวลาเข้างาน (บันทึกโดยแอดมิน)\n` +
              `👤 ชื่อ-นามสกุล: *${employee.full_name}*\n` +
              `📅 วันที่: *${thaiDate}*\n` +
              `🕒 เวลา: *${timeStr}*\n` +
              (note ? `📝 หมายเหตุ: *${note}*\n` : "");
            
            await sendTelegramToAllGroups(message, null, null, employee.full_name);
          }
          
          if (adjustedClockOut) {
            const notifyOutSettingResult = await db.query(
              'SELECT setting_value FROM settings WHERE setting_name = $1',
              ['notify_clock_out']
            );
            
            if (notifyOutSettingResult.rows.length > 0 && notifyOutSettingResult.rows[0].setting_value === '1') {
              const clockOutForNotify = new Date(adjustedClockOut);
              const thaiTimeForNotify = new Date(clockOutForNotify.getTime() + (7 * 60 * 60 * 1000));
              
              const thaiDate = thaiTimeForNotify.toLocaleDateString('th-TH');
              const timeStr = thaiTimeForNotify.toLocaleTimeString('th-TH');
              
              let message =
                `⏱ ลงเวลาออกงาน (บันทึกโดยแอดมิน)\n` +
                `👤 ชื่อ-นามสกุล: *${employee.full_name}*\n` +
                `📅 วันที่: *${thaiDate}*\n` +
                `🕒 เวลา: *${timeStr}*\n`;
              
              await sendTelegramToAllGroups(message, null, null, employee.full_name);
            }
          }
        } catch (notifyError) {
          console.error('⚠️ Error sending notification:', notifyError.message);
        }
      });
    }
    
    res.json({ success: true, message: 'เพิ่มข้อมูลการลงเวลาเรียบร้อยแล้ว', id: newId });
    
  } catch (error) {
    console.error('❌ Error adding time log:', error);
    console.error('📋 Stack trace:', error.stack);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - แก้ไขข้อมูลการลงเวลา
app.put('/api/admin/time-logs/:id', async (req, res) => {
  console.log('✏️ API: admin/time-logs/:id PUT - แก้ไขข้อมูลการลงเวลา', req.params, req.body);
  
  try {
    const { id } = req.params;
    const { clock_in, clock_out, note } = req.body;
    
    const checkResult = await db.query('SELECT id FROM time_logs WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลการลงเวลา' });
    }
    
    console.log('🚀 Starting time processing for update...');
    
    const adjustedClockIn = processAdminDateTime(clock_in);
    const adjustedClockOut = clock_out ? processAdminDateTime(clock_out) : null;
    
    console.log('✅ Time processing for update completed');
    console.log('📊 Final times for database update:');
    console.log('   Clock In (UTC):', adjustedClockIn);
    console.log('   Clock Out (UTC):', adjustedClockOut);
    
    const updateQuery = `
      UPDATE time_logs SET 
      clock_in = $1, 
      clock_out = $2, 
      note = $3
      WHERE id = $4
    `;
    
    await db.query(updateQuery, [adjustedClockIn, adjustedClockOut, note, id]);
    
    console.log(`✅ Updated time log ID: ${id}`);
    res.json({ success: true, message: 'แก้ไขข้อมูลการลงเวลาเรียบร้อยแล้ว' });
    
  } catch (error) {
    console.error('❌ Error updating time log:', error);
    console.error('📋 Stack trace:', error.stack);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - ลบข้อมูลการลงเวลา
app.delete('/api/admin/time-logs/:id', async (req, res) => {
  console.log('🗑️ API: admin/time-logs/:id DELETE - ลบข้อมูลการลงเวลา', req.params);
  
  try {
    const { id } = req.params;
    
    const checkResult = await db.query('SELECT id FROM time_logs WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลการลงเวลา' });
    }
    
    await db.query('DELETE FROM time_logs WHERE id = $1', [id]);
    
    console.log(`Deleted time log ID: ${id}`);
    res.json({ success: true, message: 'ลบข้อมูลการลงเวลาเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting time log:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ API - เพิ่มพนักงานใหม่ (ล้าง cache)
app.post('/api/admin/employees', async (req, res) => {
  console.log('➕ API: admin/employees POST - เพิ่มพนักงานใหม่', req.body);
  
  try {
    const { emp_code, full_name, position, department } = req.body;
    
    if (!emp_code || !full_name) {
      return res.json({ success: false, message: 'กรุณาระบุรหัสพนักงานและชื่อ-นามสกุล' });
    }
    
    const checkResult = await db.query('SELECT id FROM employees WHERE emp_code = $1', [emp_code]);
    
    if (checkResult.rows.length > 0) {
      return res.json({ success: false, message: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว' });
    }
    
    const insertResult = await db.query(
      `INSERT INTO employees (emp_code, full_name, position, department, status, mobile_enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [emp_code, full_name, position || null, department || null, 'active', true]
    );
    
    // ล้าง cache
    clearEmployeeCache();
    
    const newId = insertResult.rows[0].id;
    
    console.log(`เพิ่มพนักงานใหม่สำเร็จ ID: ${newId}`);
    res.json({ 
      success: true, 
      message: 'เพิ่มพนักงานเรียบร้อยแล้ว',
      id: newId
    });
    
  } catch (error) {
    console.error('Error adding employee:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - แก้ไขข้อมูลพนักงาน
app.put('/api/admin/employees/:id', async (req, res) => {
  console.log('API: admin/employees/:id PUT - แก้ไขข้อมูลพนักงาน', req.params, req.body);
  
  try {
    const { id } = req.params;
    const { emp_code, full_name, position, department, status, mobile_enabled } = req.body;
    
    if (!emp_code || !full_name) {
      return res.json({ success: false, message: 'กรุณาระบุรหัสพนักงานและชื่อ-นามสกุล' });
    }
    
    // ตรวจสอบว่ามีพนักงานนี้ในระบบหรือไม่
    const checkResult = await db.query('SELECT id FROM employees WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    // ตรวจสอบว่ารหัสพนักงานซ้ำกับคนอื่นหรือไม่ (ยกเว้นตัวเอง)
    const duplicateResult = await db.query(
      'SELECT id FROM employees WHERE emp_code = $1 AND id != $2',
      [emp_code, id]
    );
    
    if (duplicateResult.rows.length > 0) {
      return res.json({ success: false, message: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว' });
    }
    
    // แก้ไขข้อมูลพนักงาน
    const updateQuery = `
      UPDATE employees SET 
      emp_code = $1, 
      full_name = $2, 
      position = $3, 
      department = $4,
      status = $5,
      mobile_enabled = $6
      WHERE id = $7
    `;
    
    await db.query(updateQuery, [
      emp_code, 
      full_name, 
      position || null, 
      department || null,
      status || 'active',
      mobile_enabled !== undefined ? mobile_enabled : true,
      id
    ]);
    
    // ล้าง cache
    clearEmployeeCache();
    
    console.log(`แก้ไขข้อมูลพนักงาน ID: ${id} เรียบร้อยแล้ว`);
    res.json({ success: true, message: 'แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว' });
    
  } catch (error) {
    console.error('Error updating employee:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - ลบพนักงาน (soft delete)
app.delete('/api/admin/employees/:id', async (req, res) => {
  console.log('API: admin/employees DELETE - ลบพนักงาน', req.params);
  
  try {
    const { id } = req.params;
    
    // ตรวจสอบว่าพนักงานมีในระบบหรือไม่
    const employeeResult = await db.query(
      'SELECT id, full_name FROM employees WHERE id = $1',
      [id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const employee = employeeResult.rows[0];
    
    // ลบพนักงาน (hard delete)
    await db.query('DELETE FROM employees WHERE id = $1', [id]);
    
    // ล้าง cache
    clearEmployeeCache();
    
    console.log('Permanently deleted employee with ID:', id, '(', employee.full_name, ')');
    res.json({ success: true, message: 'ลบพนักงานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - ดึงการตั้งค่าทั้งหมด
app.get('/api/admin/settings', async (req, res) => {
  console.log('API: admin/settings - ดึงการตั้งค่าทั้งหมด');
  
  try {
    const result = await db.query('SELECT * FROM settings ORDER BY setting_name');
    
    // ซ่อนรหัสผ่านแอดมิน
    const filteredSettings = result.rows.map(setting => {
      if (setting.setting_name === 'admin_password') {
        return { ...setting, setting_value: '' };
      }
      return setting;
    });
    
    console.log(`Found ${result.rows.length} settings`);
    res.json({ success: true, settings: filteredSettings });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API - บันทึกการตั้งค่า
app.post('/api/admin/settings', async (req, res) => {
  console.log('API: admin/settings POST - บันทึกการตั้งค่า', req.body);
  
  try {
    const { settings } = req.body;
    
    if (!Array.isArray(settings) || settings.length === 0) {
      return res.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }
    
    await db.withTransaction(async (client) => {
      // บันทึกการตั้งค่าทีละรายการ
      for (const setting of settings) {
        if (setting.name && setting.value !== undefined) {
          await client.query(
            'UPDATE settings SET setting_value = $1 WHERE setting_name = $2',
            [setting.value, setting.name]
          );
        }
      }
    });
    
    console.log('Settings updated successfully');
    res.json({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' });
    
  } catch (error) {
    console.error('Error updating settings:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า: ' + error.message });
  }
});

// API - ดึงข้อมูลรายงานสรุป
app.get('/api/admin/dashboard', async (req, res) => {
  console.log('API: admin/dashboard - ดึงข้อมูลรายงานสรุป');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // ใช้ prepared statement สำหรับ dashboard
    const result = await db.executePrepared('GET_DASHBOARD_STATS', [today]);
    const stats = result.rows[0];
    
    // ข้อมูลการลงเวลาล่าสุด 10 รายการ
    const recentLogsResult = await db.query(
      `SELECT t.id, e.emp_code, e.full_name, t.clock_in, t.clock_out, t.note
       FROM time_logs t
       JOIN employees e ON t.employee_id = e.id
       ORDER BY t.clock_in DESC
       LIMIT 10`
    );
    
    // ปรับรูปแบบวันที่เวลา และตรวจสอบค่า null
    const formattedLogs = recentLogsResult.rows.filter(log => log && log.clock_in).map(log => {
      const clockInDate = new Date(new Date(log.clock_in).getTime() + (7 * 60 * 60 * 1000));
      const clockOutDate = log.clock_out ? new Date(new Date(log.clock_out).getTime() + (7 * 60 * 60 * 1000)) : null;
      
      return {
        ...log,
        clock_in_date: clockInDate.toLocaleDateString('th-TH'),
        clock_in_time: clockInDate.toLocaleTimeString('th-TH'),
        clock_out_time: clockOutDate ? clockOutDate.toLocaleTimeString('th-TH') : ''
      };
    });
    
    console.log('Dashboard data fetched successfully');
    
    res.json({
      success: true,
      dashboard: {
        totalEmployees: parseInt(stats.total_employees) || 0,
        checkedInToday: parseInt(stats.checked_in_today) || 0,
        notCheckedOutToday: parseInt(stats.not_checked_out_today) || 0,
        recentLogs: formattedLogs
      }
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// API พิเศษสำหรับรีเซ็ตข้อมูลแอดมิน
app.get('/api/reset-admin', async (req, res) => {
  console.log('API: reset-admin - รีเซ็ตข้อมูลแอดมิน');
  
  try {
    await db.withTransaction(async (client) => {
      // ลบข้อมูลเดิม (ถ้ามี)
      await client.query(
        'DELETE FROM settings WHERE setting_name = $1 OR setting_name = $2',
        ['admin_username', 'admin_password']
      );
      
      // เพิ่มข้อมูลใหม่
      await client.query(
        'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3)',
        ['admin_username', 'admin', 'ชื่อผู้ใช้สำหรับแอดมิน']
      );
      
      await client.query(
        'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3)',
        ['admin_password', 'admin123', 'รหัสผ่านสำหรับแอดมิน']
      );
    });
    
    console.log('Admin credentials reset successfully');
    res.json({ success: true, message: 'รีเซ็ตข้อมูลแอดมินเรียบร้อยแล้ว' });
    
  } catch (error) {
    console.error('Error resetting admin:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 6/8)
// Mobile API Routes และ Notification Functions

// ⭐ ฟังก์ชันส่งแจ้งเตือนที่ปรับปรุงแล้ว
async function sendNotification(type, employee, timestamp, userinfo, lat, lon, line_name) {
  try {
    const notifySettingResult = await db.query(
      'SELECT setting_value FROM settings WHERE setting_name = $1',
      [type === 'clock_in' ? 'notify_clock_in' : 'notify_clock_out']
    );

    if (notifySettingResult.rows.length === 0 || notifySettingResult.rows[0].setting_value !== '1') {
      return;
    }

    const date = new Date(timestamp);
    const thaiFormatter = new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
    const thaiDate = thaiFormatter.format(date);

    const hours = String(date.getUTCHours() + 7).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const returnDate = `${hours}:${minutes}:${seconds}`;

    const location = lat && lon ? `${lat}, ${lon}` : "ไม่มีข้อมูล";

    let message = type === 'clock_in' 
      ? `⏱ ลงเวลาเข้างาน\n`
      : `⏱ ลงเวลาออกงาน\n`;
    
    message += `👤 ชื่อ-นามสกุล: *${employee}*\n`;
    message += `📅 วันที่: *${thaiDate}*\n`;
    message += `🕒 เวลา: *${returnDate}*\n`;
    
    if (line_name) message += `💬 ชื่อไลน์: *${line_name}*\n`;
    if (userinfo && type === 'clock_in') message += `📝 หมายเหตุ: *${userinfo}*\n`;
    if (lat && lon) {
      message += `📍 พิกัด: *${location}*\n`;
      message += `🗺 แผนที่: [ดูแผนที่](https://www.google.com/maps/place/${lat},${lon})`;
    } else {
      message += "📍 พิกัด: *ไม่มีข้อมูล*";
    }

    await sendTelegramToAllGroups(message, lat, lon, employee);
  } catch (error) {
    console.error('❌ Error in sendNotification:', error);
  }
}

// ⭐ ฟังก์ชันส่ง Telegram ที่ปรับปรุงแล้ว
async function sendTelegramToAllGroups(message, lat, lon, employee) {
  try {
    const [tokenResult, gasUrlResult, groupsResult] = await Promise.all([
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['telegram_bot_token']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['gas_web_app_url']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['telegram_groups'])
    ]);
    
    if (tokenResult.rows.length === 0 || !tokenResult.rows[0].setting_value) {
      console.error('❌ Error getting Telegram token or token not set');
      return;
    }
    
    let gasUrl = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
    if (gasUrlResult.rows.length > 0 && gasUrlResult.rows[0].setting_value) {
      gasUrl = gasUrlResult.rows[0].setting_value.trim();
    } else {
      console.log('ไม่พบ URL ของ GSA ในฐานข้อมูล ใช้ค่าเริ่มต้น');
    }
    
    if (groupsResult.rows.length === 0 || !groupsResult.rows[0].setting_value) {
      console.error('❌ No Telegram groups configured');
      return;
    }
    
    const token = tokenResult.rows[0].setting_value;
    
    try {
      const groups = JSON.parse(groupsResult.rows[0].setting_value);
      
      // ส่งแจ้งเตือนแบบ parallel
      const promises = groups
        .filter(group => group.active && group.chat_id)
        .map(async (group) => {
          try {
            console.log(`Sending message to ${group.name} (${group.chat_id}) via GSA`);
            
            const jsonData = {
              message: message,
              chatId: group.chat_id,
              token: token
            };
            
            if (lat && lon) {
              jsonData.lat = lat;
              jsonData.lon = lon;
            }
            
            const encodedData = encodeURIComponent(JSON.stringify(jsonData));
            const urlWithParams = `${gasUrl}?opt=sendToTelegram&data=${encodedData}`;
            
            console.log('Sending request to GSA:', urlWithParams);
            
            const response = await axios.get(urlWithParams, { timeout: 10000 });
            
            console.log(`✅ Message sent to ${group.name} via GSA successfully:`, response.data);
            return response.data;
          } catch (error) {
            console.error(`❌ Error sending message to ${group.name} via GSA:`, error.message);
            console.error('Error details:', error.response?.data || error);
            return null;
          }
        });
    
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('❌ Error parsing Telegram groups:', error.message);
    }
  } catch (error) {
    console.error('❌ Error in sendTelegramToAllGroups:', error.message);
  }
}

// --- Mobile-Specific API Routes ---
const mobileApiBase = '/api/mobile';

// ⭐ Mobile - ดึงรายชื่อพนักงาน
app.get(`${mobileApiBase}/employees`, async (req, res) => {
  console.log('📱 Mobile API: employees - ดึงรายชื่อพนักงาน');
  
  try {
    const employees = await getEmployeesFromCache();
    
    // แปลงเป็นรูปแบบที่ Mobile ต้องการ
    const mobileEmployees = employees.map(emp => ({
      name: emp[0],
      code: emp[1] || emp[0], // ใช้ชื่อเป็น code ถ้าไม่มี code
      id: emp[0] // ใช้ชื่อเป็น ID
    }));
    
    res.json({
      success: true,
      employees: mobileEmployees,
      count: mobileEmployees.length
    });
  } catch (error) {
    console.error('❌ Mobile API employees error:', error);
    res.json({
      success: false,
      message: 'ไม่สามารถดึงรายชื่อพนักงานได้',
      employees: []
    });
  }
});

// ⭐ Mobile - ตรวจสอบสถานะการลงเวลา
app.get(`${mobileApiBase}/status/:employeeName`, async (req, res) => {
  console.log('📱 Mobile API: status - ตรวจสอบสถานะ', req.params);
  
  try {
    const { employeeName } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    // หาพนักงาน
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employeeName]);
    
    if (empResult.rows.length === 0) {
      return res.json({
        success: false,
        status: 'employee_not_found',
        message: 'ไม่พบข้อมูลพนักงาน'
      });
    }
    
    const emp = empResult.rows[0];
    
    // ตรวจสอบการลงเวลาวันนี้
    const recordResult = await db.executePrepared('GET_TODAY_RECORD', [emp.id, today]);
    
    if (recordResult.rows.length === 0) {
      return res.json({
        success: true,
        status: 'not_clocked_in',
        message: 'ยังไม่ได้ลงเวลาเข้า',
        employee_name: emp.full_name
      });
    }
    
    const record = recordResult.rows[0];
    
    if (!record.clock_out) {
      // คำนวณเวลาเข้างาน
      const clockInTime = new Date(new Date(record.clock_in).getTime() + (7 * 60 * 60 * 1000));
      
      return res.json({
        success: true,
        status: 'clocked_in',
        message: 'ลงเวลาเข้าแล้ว กำลังทำงาน',
        employee_name: emp.full_name,
        clock_in_time: clockInTime.toLocaleTimeString('th-TH')
      });
    } else {
      // คำนวณเวลาเข้า-ออก
      const clockInTime = new Date(new Date(record.clock_in).getTime() + (7 * 60 * 60 * 1000));
      const clockOutTime = new Date(new Date(record.clock_out).getTime() + (7 * 60 * 60 * 1000));
      
      return res.json({
        success: true,
        status: 'completed',
        message: 'ลงเวลาครบแล้ววันนี้',
        employee_name: emp.full_name,
        clock_in_time: clockInTime.toLocaleTimeString('th-TH'),
        clock_out_time: clockOutTime.toLocaleTimeString('th-TH')
      });
    }
    
  } catch (error) {
    console.error('❌ Mobile API status error:', error);
    res.json({
      success: false,
      status: 'error',
      message: 'เกิดข้อผิดพลาด: ' + error.message
    });
  }
});

// ⭐ Mobile - ดึงประวัติการลงเวลา
app.get(`${mobileApiBase}/history/:employeeName`, async (req, res) => {
  console.log('📱 Mobile API: history - ดึงประวัติการลงเวลา', req.params);
  
  try {
    const { employeeName } = req.params;
    const { limit = 7 } = req.query;
    
    // หาพนักงาน
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employeeName]);
    
    if (empResult.rows.length === 0) {
      return res.json({
        success: false,
        message: 'ไม่พบข้อมูลพนักงาน',
        history: []
      });
    }
    
    const emp = empResult.rows[0];
    
    // ดึงประวัติ
    const historyResult = await db.executePrepared('GET_EMPLOYEE_HISTORY', [emp.id, limit]);
    
    const history = historyResult.rows.map(log => {
      const clockInDate = new Date(new Date(log.clock_in).getTime() + (7 * 60 * 60 * 1000));
      const clockOutDate = log.clock_out ? new Date(new Date(log.clock_out).getTime() + (7 * 60 * 60 * 1000)) : null;
      
      return {
        date: clockInDate.toLocaleDateString('th-TH'),
        clock_in: clockInDate.toLocaleTimeString('th-TH'),
        clock_out: clockOutDate ? clockOutDate.toLocaleTimeString('th-TH') : null,
        note: log.note || '',
        status: log.status || 'normal',
        duration: clockOutDate ? calculateDuration(new Date(log.clock_in), new Date(log.clock_out)) : null
      };
    });
    
    res.json({
      success: true,
      history: history,
      employee_name: emp.full_name
    });
    
  } catch (error) {
    console.error('❌ Mobile API history error:', error);
    res.json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message,
      history: []
    });
  }
});

// ⭐ Mobile - Dashboard สำหรับ mobile
app.get(`${mobileApiBase}/dashboard`, async (req, res) => {
  console.log('📱 Mobile API: dashboard - ดึงข้อมูลแดชบอร์ด');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // ใช้ prepared statement
    const result = await db.executePrepared('GET_DASHBOARD_STATS', [today]);
    const stats = result.rows[0];
    
    res.json({
      success: true,
      today: {
        date: new Date().toLocaleDateString('th-TH'),
        total_employees: parseInt(stats.total_employees) || 0,
        checked_in: parseInt(stats.checked_in_today) || 0,
        not_checked_out: parseInt(stats.not_checked_out_today) || 0,
        checked_out: (parseInt(stats.checked_in_today) || 0) - (parseInt(stats.not_checked_out_today) || 0)
      }
    });
    
  } catch (error) {
    console.error('❌ Mobile API dashboard error:', error);
    res.json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message,
      today: {
        total_employees: 0,
        checked_in: 0,
        not_checked_out: 0,
        checked_out: 0
      }
    });
  }
});

// ⭐ Mobile - Batch API สำหรับเรียก API หลายตัวพร้วมกัน
app.post(`${mobileApiBase}/batch`, async (req, res) => {
  console.log('📱 Mobile API: batch - ประมวลผลคำขอหลายรายการ', req.body);
  
  try {
    const { operations } = req.body;
    
    if (!Array.isArray(operations)) {
      return res.json({
        success: false,
        message: 'operations ต้องเป็น array'
      });
    }
    
    const results = [];
    
    for (const operation of operations) {
      try {
        let result = { success: false, data: null };
        
        switch (operation.type) {
          case 'get_settings':
            const settingsResult = await db.query('SELECT * FROM settings');
            const settings = {};
            settingsResult.rows.forEach(row => {
              settings[row.setting_name] = row.setting_value;
            });
            result = { success: true, data: settings };
            break;
            
          case 'get_liff_id':
            const liffResult = await db.query(
              'SELECT setting_value FROM settings WHERE setting_name = $1',
              ['liff_id']
            );
            result = {
              success: true,
              data: {
                liff_id: liffResult.rows.length > 0 ? liffResult.rows[0].setting_value : '2001032478-VR5Akj0k'
              }
            };
            break;
            
          default:
            result = { success: false, data: null, message: 'Unknown operation type' };
        }
        
        results.push(result);
        
      } catch (error) {
        console.error('❌ Batch operation error:', operation, error);
        results.push({
          success: false,
          data: null,
          message: error.message
        });
      }
    }
    
    res.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    console.error('❌ Mobile API batch error:', error);
    res.json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message,
      results: []
    });
  }
});

// ⭐ Mobile - ปรับปรุง clockin API ให้รองรับ mobile response
app.post(`${mobileApiBase}/clockin`, async (req, res) => {
  console.log('📱 Mobile API: clockin - บันทึกเวลาเข้า (Mobile)', req.body);
  
  try {
    const { 
      employee, 
      userinfo, 
      lat, 
      lon, 
      line_name, 
      line_picture, 
      client_time 
    } = req.body;
    
    if (!employee) {
      return res.json({ 
        success: false,
        message: 'กรุณาระบุชื่อพนักงาน' 
      });
    }
    
    // ใช้ prepared statement
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ 
        success: false,
        message: 'ไม่พบข้อมูลพนักงาน' 
      });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    // ตรวจสอบการลงเวลาซ้ำ
    const checkExistingResult = await db.executePrepared('CHECK_CLOCK_IN_TODAY', [emp.id, today]);
    
    if (checkExistingResult.rows.length > 0) {
      return res.json({ 
        success: false,
        message: 'คุณได้ลงเวลาเข้าแล้ววันนี้'
      });
    }
    
    const now = client_time ? adjustClientTime(client_time) : new Date().toISOString();
    
    // บันทึกเวลาเข้า
    await db.executePrepared('INSERT_TIME_LOG', [
      emp.id, now, userinfo || null, lat || null, lon || null, line_name || null, line_picture || null
    ]);
    
    // ส่งแจ้งเตือน (ไม่รอผลลัพธ์)
    setImmediate(async () => {
      try {
        await sendNotification('clock_in', employee, now, userinfo, lat, lon, line_name);
      } catch (error) {
        console.error('❌ Notification error:', error);
      }
    });
    
    // ปรับเวลาเป็นเวลาไทย
    const date = new Date(now);
    const thaiTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const timeString = thaiTime.toLocaleTimeString('th-TH');
    
    return res.json({
      success: true,
      message: `ลงเวลาเข้า ${timeString} เรียบร้อย`,
      time: timeString,
      timestamp: now,
      employee: employee
    });
    
  } catch (error) {
    console.error('❌ Error in mobile clockin:', error);
    return res.json({ 
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message 
    });
  }
});

// ⭐ Mobile - ปรับปรุง clockout API ให้รองรับ mobile response
app.post(`${mobileApiBase}/clockout`, async (req, res) => {
  console.log('📱 Mobile API: clockout - บันทึกเวลาออก (Mobile)', req.body);
  
  try {
    const { 
      employee, 
      lat, 
      lon, 
      line_name, 
      line_picture, 
      client_time 
    } = req.body;
    
    if (!employee) {
      return res.json({ 
        success: false,
        message: 'กรุณาระบุชื่อพนักงาน' 
      });
    }
    
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ 
        success: false,
        message: 'ไม่พบข้อมูลพนักงาน' 
      });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    const recordResult = await db.executePrepared('GET_TODAY_RECORD', [emp.id, today]);
    
    if (recordResult.rows.length === 0) {
      return res.json({ 
        success: false,
        message: 'คุณยังไม่ได้ลงเวลาเข้าวันนี้'
      });
    }
    
    const record = recordResult.rows[0];
    
    if (record.clock_out) {
      return res.json({ 
        success: false,
        message: 'คุณได้ลงเวลาออกแล้ววันนี้'
      });
    }
    
    const now = client_time ? adjustClientTime(client_time) : new Date().toISOString();
    
    // บันทึกเวลาออก
    await db.executePrepared('UPDATE_CLOCK_OUT', [
      now, lat || null, lon || null, line_name || null, line_picture || null, record.id
    ]);
    
    // ส่งแจ้งเตือน (ไม่รอผลลัพธ์)
    setImmediate(async () => {
      try {
        await sendNotification('clock_out', employee, now, null, lat, lon, line_name);
      } catch (error) {
        console.error('❌ Notification error:', error);
      }
    });
    
    // ปรับเวลาเป็นเวลาไทย
    const date = new Date(now);
    const thaiTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const timeString = thaiTime.toLocaleTimeString('th-TH');
    
    return res.json({
      success: true,
      message: `ลงเวลาออก ${timeString} เรียบร้อย`,
      time: timeString,
      timestamp: now,
      employee: employee
    });
    
  } catch (error) {
    console.error('❌ Error in mobile clockout:', error);
    return res.json({ 
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message 
    });
  }
});

// ⭐ Mobile - Health Check และ App Info
app.get(`${mobileApiBase}/health`, (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server_time: new Date().toLocaleString('th-TH'),
    timezone: 'Asia/Bangkok',
    version: '1.0.0'
  });
});

// ⭐ Mobile - App Configuration
app.get(`${mobileApiBase}/config`, async (req, res) => {
  try {
    const [liffResult, offsetResult, orgResult] = await Promise.all([
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['liff_id']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['time_offset']),
      db.query('SELECT setting_value FROM settings WHERE setting_name = $1', ['organization_name'])
    ]);
    
    res.json({
      success: true,
      config: {
        liff_id: liffResult.rows.length > 0 ? liffResult.rows[0].setting_value : '2001032478-VR5Akj0k',
        time_offset: offsetResult.rows.length > 0 ? parseInt(offsetResult.rows[0].setting_value) : 420,
        organization_name: orgResult.rows.length > 0 ? orgResult.rows[0].setting_value : 'องค์การบริหารส่วนตำบลหัวนา',
        features: {
          location_required: true,
          notification_enabled: true,
          offline_mode: true
        }
      }
    });
  } catch (error) {
    console.error('❌ Mobile config error:', error);
    res.json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message,
      config: {
        liff_id: '2001032478-VR5Akj0k',
        time_offset: 420,
        organization_name: 'องค์การบริหารส่วนตำบลหัวนา'
      }
    });
  }
});

// ⭐ เพิ่ม Error Handler สำหรับ Mobile API
app.use(`${mobileApiBase}/*`, (err, req, res, next) => {
  console.error('❌ Mobile API Error:', err);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ⭐ Test APIs สำหรับการทดสอบ
app.post('/api/test-clockin', async (req, res) => {
  console.log('API: test-clockin - ทดสอบการลงเวลาเข้า', req.body);
  
  try {
    const { employee, userinfo } = req.body;
    
    if (!employee) {
      return res.json({ msg: 'กรุณาระบุชื่อพนักงาน' });
    }
    
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ msg: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    const checkExistingResult = await db.executePrepared('CHECK_CLOCK_IN_TODAY', [emp.id, today]);
    
    if (checkExistingResult.rows.length > 0) {
      return res.json({ 
        msg: 'คุณได้ลงเวลาเข้าแล้ววันนี้', 
        employee
      });
    }
    
    const now = new Date().toISOString();
    
    await db.executePrepared('INSERT_TIME_LOG', [
      emp.id, now, userinfo || null, 13.7563 || null, 100.5018 || null, null, null
    ]);
    
    const utcTime = new Date(now);
    const thaiTime = new Date(utcTime.getTime() + (7 * 60 * 60 * 1000));
    const returnDate = thaiTime.toLocaleTimeString('th-TH');
    
    return res.json({
      msg: 'SUCCESS',
      employee,
      return_date: returnDate,
      return_date_utc: now
    });
  } catch (error) {
    console.error('Error in test clockin:', error);
    return res.json({ msg: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

app.post('/api/test-clockout', async (req, res) => {
  console.log('API: test-clockout - ทดสอบการลงเวลาออก', req.body);
  
  try {
    const { employee } = req.body;
    
    if (!employee) {
      return res.json({ msg: 'กรุณาระบุชื่อพนักงาน' });
    }
    
    const empResult = await db.executePrepared('GET_EMPLOYEE_BY_CODE', [employee]);
    
    if (empResult.rows.length === 0) {
      return res.json({ msg: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const emp = empResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    
    const recordResult = await db.executePrepared('GET_TODAY_RECORD', [emp.id, today]);
    
    if (recordResult.rows.length === 0) {
      return res.json({ 
        msg: 'คุณยังไม่ได้ลงเวลาเข้าวันนี้', 
        employee
      });
    }
    
    const record = recordResult.rows[0];
    
    if (record.clock_out) {
      return res.json({ 
        msg: 'คุณได้ลงเวลาออกแล้ววันนี้', 
        employee
      });
    }
    
    const now = new Date().toISOString();
    
    await db.executePrepared('UPDATE_CLOCK_OUT', [
      now, 13.7563 || null, 100.5018 || null, null, null, record.id
    ]);
    
    const utcTime = new Date(now);
    const thaiTime = new Date(utcTime.getTime() + (7 * 60 * 60 * 1000));
    const returnDate = thaiTime.toLocaleTimeString('th-TH');
    
    return res.json({
      msg: 'SUCCESS',
      employee,
      return_date: returnDate,
      return_date_utc: now
    });
  } catch (error) {
    console.error('Error in test clockout:', error);
    return res.json({ msg: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 7/8)
// Health Check, Monitoring และ Error Handlers

// ⭐ Health Check Endpoint สำหรับ Production Monitoring
app.get('/health', async (req, res) => {
  try {
    // ตรวจสอบ database connection
    const dbHealth = await db.healthCheck();
    
    // ตรวจสอบ memory usage
    const memUsage = process.memoryUsage();
    const memHealthy = memUsage.heapUsed < memUsage.heapTotal * 0.9; // < 90%
    
    const health = {
      status: dbHealth.healthy && memHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        healthy: memHealthy,
        usage_percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      database: {
        connected: dbHealth.healthy,
        response_time: dbHealth.timestamp ? new Date(dbHealth.timestamp).getTime() - Date.now() : null,
        ...dbHealth.poolInfo
      },
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      timezone: process.env.TZ || 'Asia/Bangkok'
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
    
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ⭐ Metrics Endpoint สำหรับ Monitoring
app.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    // เพิ่ม database metrics
    if (db && db.pool) {
      const poolStats = db.getPoolStats();
      metrics.database = {
        total_connections: poolStats.totalCount,
        idle_connections: poolStats.idleCount,
        waiting_requests: poolStats.waitingCount,
        connected: poolStats.connected,
        reconnect_attempts: poolStats.reconnectAttempts
      };
    }
    
    // เพิ่ม cache metrics
    if (typeof employeeCache !== 'undefined') {
      metrics.cache = {
        employee_cache_size: employeeCache ? employeeCache.length : 0,
        employee_cache_age: employeeCacheTime ? Date.now() - employeeCacheTime : 0,
        api_cache_size: mobilePerf.apiCache.size,
        api_cache_hit_rate: calculateCacheHitRate()
      };
    }
    
    // เพิ่ม request metrics
    metrics.requests = {
      total_processed: global.totalRequests || 0,
      errors_count: global.errorCount || 0,
      avg_response_time: global.avgResponseTime || 0
    };
    
    res.json(metrics);
    
  } catch (error) {
    console.error('❌ Metrics error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ⭐ Request Logging สำหรับ Production
if (process.env.NODE_ENV === 'production') {
  // Initialize global counters
  global.totalRequests = 0;
  global.errorCount = 0;
  global.totalResponseTime = 0;
  global.avgResponseTime = 0;
  
  app.use((req, res, next) => {
    const startTime = Date.now();
    global.totalRequests++;
    
    // Override res.end to log response time
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;
      
      // Update average response time
      global.totalResponseTime += duration;
      global.avgResponseTime = Math.round(global.totalResponseTime / global.totalRequests);
      
      // Log สำหรับ requests ที่ใช้เวลานาน
      if (duration > 2000) {
        console.warn(`🐌 Very Slow Request: ${req.method} ${req.url} - ${duration}ms - ${res.statusCode}`);
      } else if (duration > 1000) {
        console.log(`⚠️ Slow Request: ${req.method} ${req.url} - ${duration}ms - ${res.statusCode}`);
      }
      
      // Log errors
      if (res.statusCode >= 400) {
        global.errorCount++;
        console.log(`❌ Error Request: ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
      }
      
      originalEnd.apply(res, args);
    };
    
    next();
  });
}

// ⭐ PWA Offline Fallback
app.get('/offline.html', (req, res) => {
  const offlineHtml = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ออฟไลน์ - ระบบลงเวลา</title>
      <style>
        body { 
          font-family: 'Kanit', sans-serif; 
          text-align: center; 
          padding: 50px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        .offline-container {
          background: rgba(255,255,255,0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .offline-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        .retry-btn {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 25px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 20px;
          transition: all 0.3s ease;
        }
        .retry-btn:hover {
          background: #45a049;
          transform: translateY(-2px);
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="offline-icon">📱💔</div>
        <h1>ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1>
        <p>กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณ</p>
        <p>ข้อมูลจะถูกบันทึกไว้และส่งเมื่อมีการเชื่อมต่อ</p>
        <button class="retry-btn" onclick="window.location.reload()">
          🔄 ลองใหม่
        </button>
      </div>
      <script>
        // Auto-reload when online
        window.addEventListener('online', () => {
          window.location.reload();
        });
      </script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(offlineHtml);
});

// ⭐ Cleanup Function สำหรับ Memory Management
function performCleanup() {
  console.log('🧹 Performing periodic cleanup...');
  
  try {
    // ล้าง API cache เก่า
    if (mobilePerf && mobilePerf.apiCache) {
      const now = Date.now();
      const cacheSize = mobilePerf.apiCache.size;
      
      for (const [key, value] of mobilePerf.apiCache.entries()) {
        if (now - value.timestamp > 300000) { // 5 minutes
          mobilePerf.apiCache.delete(key);
        }
      }
      
      const newSize = mobilePerf.apiCache.size;
      if (newSize < cacheSize) {
        console.log(`🧹 Cleared ${cacheSize - newSize} expired API cache entries`);
      }
    }
    
    // ล้าง employee cache หากเก่าเกินไป
    if (employeeCacheTime && (Date.now() - employeeCacheTime) > CACHE_DURATION * 2) {
      clearEmployeeCache();
      console.log('🧹 Cleared expired employee cache');
    }
    
    // Force garbage collection ใน development
    if (process.env.NODE_ENV === 'development' && global.gc) {
      const beforeMem = process.memoryUsage().heapUsed;
      global.gc();
      const afterMem = process.memoryUsage().heapUsed;
      const freed = Math.round((beforeMem - afterMem) / 1024 / 1024);
      if (freed > 0) {
        console.log(`🧹 Garbage collection freed ${freed}MB`);
      }
    }
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}

// รัน cleanup ทุก 10 นาที
setInterval(performCleanup, 10 * 60 * 1000);

// ⭐ Database Connection Monitoring
if (db && db.pool) {
  db.pool.on('connect', (client) => {
    console.log('🔗 New database client connected');
  });
  
  db.pool.on('error', (err) => {
    console.error('❌ Database pool error:', err);
    // ส่งแจ้งเตือนไปยัง monitoring service ถ้ามี
  });
  
  db.pool.on('remove', (client) => {
    console.log('🔌 Database client removed from pool');
  });
}

// ⭐ Helper Functions
function calculateCacheHitRate() {
  // This would be implemented with actual cache hit/miss tracking
  return 0; // Placeholder
}

// ⭐ Admin Routes (เก็บเป็นส่วนหลัง)
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

// ⭐ Additional Admin APIs (เพิ่มเติม)
app.get('/api/admin/time-logs/:id', async (req, res) => {
  console.log('API: admin/time-logs/:id - ดึงข้อมูลการลงเวลาเฉพาะรายการ', req.params);
  
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT t.id, t.employee_id, e.emp_code, e.full_name, e.position, e.department, 
             t.clock_in, t.clock_out, t.note, t.status
      FROM time_logs t
      JOIN employees e ON t.employee_id = e.id
      WHERE t.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลการลงเวลา' });
    }
    
    const log = result.rows[0];
    res.json({ success: true, log });
  } catch (error) {
    console.error('Error getting time log:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

app.get('/api/admin/employees/:id', async (req, res) => {
  console.log('API: admin/employees/:id - ดึงข้อมูลพนักงานเฉพาะรายการ', req.params);
  
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT id, emp_code, full_name, position, department, 
             line_id, line_name, status, mobile_enabled, created_at
      FROM employees
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
    }
    
    const employee = result.rows[0];
    res.json({ success: true, employee });
  } catch (error) {
    console.error('Error getting employee:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ Admin - Import/Export APIs
app.post('/api/admin/import-employees', async (req, res) => {
  console.log('API: admin/import-employees - นำเข้ารายชื่อพนักงานจากไฟล์', req.body);
  
  try {
    const { employees, skipExisting } = req.body;
    
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.json({ success: false, message: 'ไม่มีข้อมูลที่จะนำเข้า' });
    }
    
    // ตรวจสอบว่าข้อมูลมีรูปแบบถูกต้องหรือไม่
    for (const emp of employees) {
      if (!emp.emp_code || !emp.full_name) {
        return res.json({ 
          success: false, 
          message: 'ข้อมูลไม่ถูกต้อง ต้องมีรหัสพนักงานและชื่อพนักงาน' 
        });
      }
    }
    
    const result = {
      success: true,
      total: employees.length,
      imported: 0,
      skipped: 0,
      errors: []
    };
    
    await db.withTransaction(async (client) => {
      for (const emp of employees) {
        try {
          // ตรวจสอบว่ามีรหัสพนักงานนี้ในระบบแล้วหรือไม่
          const checkResult = await client.query(
            'SELECT id FROM employees WHERE emp_code = $1',
            [emp.emp_code]
          );
          
          if (checkResult.rows.length > 0) {
            if (skipExisting) {
              result.skipped++;
              continue;
            } else {
              // อัปเดตข้อมูลพนักงาน
              await client.query(
                `UPDATE employees 
                 SET full_name = $1, position = $2, department = $3, status = $4, mobile_enabled = $5
                 WHERE emp_code = $6`,
                [
                  emp.full_name,
                  emp.position || null,
                  emp.department || null,
                  emp.status || 'active',
                  emp.mobile_enabled !== undefined ? emp.mobile_enabled : true,
                  emp.emp_code
                ]
              );
              result.imported++;
            }
          } else {
            // เพิ่มพนักงานใหม่
            await client.query(
              `INSERT INTO employees 
               (emp_code, full_name, position, department, status, mobile_enabled)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                emp.emp_code,
                emp.full_name,
                emp.position || null,
                emp.department || null,
                emp.status || 'active',
                emp.mobile_enabled !== undefined ? emp.mobile_enabled : true
              ]
            );
            result.imported++;
          }
        } catch (error) {
          console.error('Error importing employee:', emp, error);
          result.errors.push({
            emp_code: emp.emp_code,
            full_name: emp.full_name,
            error: error.message
          });
        }
      }
    });
    
    // ล้าง cache
    clearEmployeeCache();
    
    console.log('Import result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error importing employees:', error);
    res.json({
      success: false,
      message: 'เกิดข้อผิดพลาด: ' + error.message
    });
  }
});

app.post('/api/admin/export-time-logs', async (req, res) => {
  console.log('API: admin/export-time-logs - ส่งออกข้อมูลการลงเวลา', req.body);
  
  try {
    const { from_date, to_date, employee_id, format } = req.body;
    
    let query = `
      SELECT e.emp_code, e.full_name, e.position, e.department, 
             t.clock_in, t.clock_out, t.note, t.status,
             t.latitude_in, t.longitude_in, t.latitude_out, t.longitude_out
      FROM time_logs t
      JOIN employees e ON t.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (from_date) {
      query += ` AND DATE(t.clock_in) >= ${paramIndex++}`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND DATE(t.clock_in) <= ${paramIndex++}`;
      params.push(to_date);
    }
    
    if (employee_id) {
      query += ` AND t.employee_id = ${paramIndex++}`;
      params.push(employee_id);
    }
    
    query += ' ORDER BY t.clock_in DESC';
    
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลที่ตรงตามเงื่อนไข' });
    }
    
    // ปรับรูปแบบข้อมูลให้อ่านง่าย
    const formattedLogs = result.rows.map(log => {
      const clockInDate = new Date(new Date(log.clock_in).getTime() + (7 * 60 * 60 * 1000));
      const clockOutDate = log.clock_out ? new Date(new Date(log.clock_out).getTime() + (7 * 60 * 60 * 1000)) : null;
      
      return {
        "รหัสพนักงาน": log.emp_code,
        "ชื่อ-นามสกุล": log.full_name,
        "ตำแหน่ง": log.position || '',
        "แผนก": log.department || '',
        "วันที่เข้างาน": clockInDate.toLocaleDateString('th-TH'),
        "เวลาเข้างาน": clockInDate.toLocaleTimeString('th-TH'),
        "วันที่ออกงาน": clockOutDate ? clockOutDate.toLocaleDateString('th-TH') : '',
        "เวลาออกงาน": clockOutDate ? clockOutDate.toLocaleTimeString('th-TH') : '',
        "หมายเหตุ": log.note || '',
        "สถานะ": log.status,
        "พิกัดเข้า": log.latitude_in && log.longitude_in ? `${log.latitude_in}, ${log.longitude_in}` : '',
        "พิกัดออก": log.latitude_out && log.longitude_out ? `${log.latitude_out}, ${log.longitude_out}` : ''
      };
    });
    
    res.json({
      success: true,
      data: formattedLogs,
      count: formattedLogs.length
    });
    
  } catch (error) {
    console.error('Error exporting time logs:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ Admin - Database Backup
app.get('/api/admin/backup-database', async (req, res) => {
  console.log('API: admin/backup-database - สำรองข้อมูลฐานข้อมูล');
  
  try {
    const employeesResult = await db.query('SELECT * FROM employees ORDER BY id');
    const timeLogsResult = await db.query('SELECT * FROM time_logs ORDER BY id');
    const settingsResult = await db.query('SELECT * FROM settings ORDER BY id');
    
    // สร้าง object ข้อมูลสำรอง
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      employees: employeesResult.rows,
      time_logs: timeLogsResult.rows,
      settings: settingsResult.rows.filter(s => s.setting_name !== 'admin_password') // ไม่รวมรหัสผ่าน
    };
    
    // แปลงเป็น JSON
    const backupJSON = JSON.stringify(backupData, null, 2);
    
    // ส่งไฟล์ JSON กลับไปยังผู้ใช้
    res.setHeader('Content-Disposition', `attachment; filename=time_tracker_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(backupJSON);
    
  } catch (error) {
    console.error('Error backing up database:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// ⭐ Admin - Cleanup APIs
app.post('/api/admin/cleanup-time-logs', async (req, res) => {
  console.log('API: admin/cleanup-time-logs - เคลียร์ข้อมูลประวัติการลงเวลา', req.body);
  
  try {
    const { date_before, employee_id, export_before_delete, cleanup_type } = req.body;
    
    if (!date_before && !cleanup_type) {
      return res.json({ success: false, message: 'กรุณาระบุข้อมูลสำหรับการลบ' });
    }
    
    let query = 'SELECT t.id FROM time_logs t JOIN employees e ON t.employee_id = e.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // เงื่อนไขตามช่วงเวลา
    if (date_before) {
      query += ` AND DATE(t.clock_in) < ${paramIndex++}`;
      params.push(date_before);
    }
    
    if (employee_id) {
      query += ` AND t.employee_id = ${paramIndex++}`;
      params.push(employee_id);
    }
    
    // เงื่อนไขตามประเภทการลบ
    if (cleanup_type === 'older_than_6_months') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      query += ` AND DATE(t.clock_in) < ${paramIndex++}`;
      params.push(sixMonthsAgo.toISOString().split('T')[0]);
    } else if (cleanup_type === 'older_than_1_year') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      query += ` AND DATE(t.clock_in) < ${paramIndex++}`;
      params.push(oneYearAgo.toISOString().split('T')[0]);
    }
    
    const dataToDelete = await db.query(query, params);
    
    if (dataToDelete.rows.length === 0) {
      return res.json({ success: false, message: 'ไม่พบข้อมูลที่ตรงเงื่อนไข' });
    }
    
    // ลบข้อมูล
    const idsToDelete = dataToDelete.rows.map(row => row.id);
    let deletedCount = 0;
    
    // แบ่งเป็นชุดๆ ลบ
    const batchSize = 1000;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize);
      const placeholders = batch.map((_, idx) => `${idx + 1}`).join(', ');
      
      const deleteResult = await db.query(
        `DELETE FROM time_logs WHERE id IN (${placeholders})`,
        batch
      );
      
      deletedCount += deleteResult.rowCount;
    }
    
    console.log(`ลบข้อมูลทั้งหมด ${deletedCount} รายการ`);
    
    res.json({
      success: true,
      message: `ลบข้อมูลเรียบร้อยแล้ว ${deletedCount} รายการ`,
      deleted_count: deletedCount
    });
    
  } catch (error) {
    console.error('Error cleaning up time logs:', error);
    res.json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

// server.js - Mobile Time Tracker Server (ส่วนที่ 8/8)
// Graceful Shutdown และ Server Start

// ⭐ Global Error Handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  
  // ใน production ควรส่ง error ไป monitoring service
  if (process.env.NODE_ENV === 'production') {
    // sendErrorToMonitoring(error);
  }
  
  // Graceful shutdown
  console.log('🛑 Process will exit due to uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Log error details
  if (reason instanceof Error) {
    console.error('Stack trace:', reason.stack);
  }
  
  // ใน production ควรส่ง error ไป monitoring service
  if (process.env.NODE_ENV === 'production') {
    // sendErrorToMonitoring(reason);
  }
  
  // Don't exit on unhandled rejection, just log it
  console.log('⚠️ Unhandled rejection logged, continuing...');
});

// ⭐ Graceful Shutdown Handlers
process.on('SIGTERM', async () => {
  console.log('📱 SIGTERM received, shutting down gracefully...');
  
  try {
    console.log('📱 Closing server connections...');
    
    // Stop accepting new requests
    if (server) {
      server.close(() => {
        console.log('📱 HTTP server closed');
      });
    }
    
    // ปิด database connections
    if (db && db.close) {
      console.log('📱 Closing database connections...');
      await db.close();
      console.log('📱 Database connections closed');
    }
    
    // รอให้ pending requests เสร็จสิ้น
    console.log('📱 Waiting for pending requests...');
    setTimeout(() => {
      console.log('📱 Server shutdown complete');
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('📱 SIGINT received, shutting down gracefully...');
  
  try {
    // ปิด database connections
    if (db && db.close) {
      console.log('📱 Closing database connections...');
      await db.close();
    }
    
    console.log('📱 Server shutdown complete');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// ⭐ Startup Logging
console.log('🚀 Server configuration:');
console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   - Port: ${port}`);
console.log(`   - Node version: ${process.version}`);
console.log(`   - Platform: ${process.platform}`);
console.log(`   - Memory limit: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`);
console.log(`   - Timezone: ${process.env.TZ || 'system default'}`);
console.log(`   - Database: ${process.env.DATABASE_URL ? 'External' : 'Local'}`);

// ⭐ Server Instance Variable
let server;

// ⭐ Export for Vercel/Cloud deployment
module.exports = app;

// ⭐ Local Development Server Start
if (process.env.NODE_ENV !== 'production') {
  server = app.listen(port, () => {
    console.log('\n🎉 ========================================');
    console.log('🚀 Mobile Time Tracker Server is running!');
    console.log('🎉 ========================================');
    console.log(`🌐 Main App: http://localhost:${port}`);
    console.log(`📱 Mobile API: http://localhost:${port}/api/mobile`);
    console.log(`👨‍💼 Admin Panel: http://localhost:${port}/admin`);
    console.log(`💊 Health Check: http://localhost:${port}/health`);
    console.log(`📊 Metrics: http://localhost:${port}/metrics`);
    console.log(`🔧 Debug: http://localhost:${port}/debug`);
    console.log('🎉 ========================================\n');
    
    // เริ่มต้น background tasks
    console.log('🔄 Starting background services...');
    
    // Test database connection
    db.healthCheck().then(health => {
      if (health.healthy) {
        console.log('✅ Database connection verified');
      } else {
        console.error('❌ Database connection failed');
      }
    }).catch(err => {
      console.error('❌ Database health check failed:', err);
    });
    
    // Start cache warming
    setTimeout(() => {
      console.log('🔥 Warming up caches...');
      getEmployeesFromCache().then(employees => {
        console.log(`✅ Employee cache warmed with ${employees.length} employees`);
      }).catch(err => {
        console.warn('⚠️ Cache warming failed:', err.message);
      });
    }, 2000);
    
    console.log('✅ Server started successfully!');
  });
  
  // Handle server errors
  server.on('error', (error) => {
    if (error.syscall !== 'listen') {
      throw error;
    }
    
    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
    
    switch (error.code) {
      case 'EACCES':
        console.error(`❌ ${bind} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(`❌ ${bind} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });
  
} else {
  // Production mode - just log that we're ready
  console.log('🚀 Production server ready for deployment');
  console.log('✅ All routes and middleware configured');
}

// ⭐ Additional Production Checks
if (process.env.NODE_ENV === 'production') {
  // Verify critical environment variables
  const requiredEnvVars = ['DATABASE_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('🛑 Server cannot start without these variables');
    process.exit(1);
  }
  
  // Set production optimizations
  app.set('trust proxy', 1); // Trust first proxy
  
  console.log('✅ Production environment verified');
  console.log('🔒 Security features enabled');
  console.log('⚡ Performance optimizations active');
}

// ⭐ Final cleanup on exit
process.on('exit', (code) => {
  console.log(`\n📱 Process exiting with code: ${code}`);
  console.log('👋 Goodbye! Thanks for using Mobile Time Tracker');
});

// ⭐ Memory monitoring for development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    if (memPercent > 80) {
      console.warn(`⚠️ High memory usage: ${memUsed}MB / ${memTotal}MB (${memPercent}%)`);
    }
  }, 60000); // Check every minute
}

// ⭐ สำคัญที่สุด: Start Server ต้องอยู่ที่ท้ายสุด
async function startServer() {
  try {
    // เชื่อมต่อฐานข้อมูล (ไม่บังคับ)
    await initDatabase();
    
    // ⭐ สำคัญ: ต้อง listen เสมอ
    const server = app.listen(port, '0.0.0.0', () => {
      console.log('\n🎉 ========================================');
      console.log('🚀 Mobile Time Tracker Server is running!');
      console.log('🎉 ========================================');
      console.log(`🌐 Server URL: http://0.0.0.0:${port}`);
      console.log(`💊 Health Check: http://0.0.0.0:${port}/health`);
      console.log(`📱 Mobile API: http://0.0.0.0:${port}/api/mobile`);
      console.log('🎉 ========================================\n');
      console.log('✅ Server started successfully!');
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      }
      throw error;
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📱 SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('📱 Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    // ไม่ exit ให้ลอง listen แล้วกัน
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port} (limited functionality)`);
    });
  }
}

// ⭐ Start the server
startServer();

console.log('📝 Server script loaded successfully');
console.log('⏳ Starting server...');