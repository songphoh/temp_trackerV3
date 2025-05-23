const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Connection string from environment variable
const connectionString = process.env.DATABASE_URL || "postgresql://postgres.ofzfxbhzkvrumsgrgogq:%40Songphon544942@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

// Optimized pool configuration
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined
  },
  // Increased timeouts and better pool management
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 60000,
  max: 20, // Increased for better concurrency
  min: 4,  // Maintain minimum connections
  acquireTimeoutMillis: 60000,
  allowExitOnIdle: false,
  timezone: 'Asia/Bangkok'
});

// Error handling for the pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1); // Exit on critical errors
});

// Connection monitoring
pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('remove', (client) => {
  console.log('Client removed from pool');
});

// Improved database initialization
async function initializeDatabase() {
  let client;
  try {
    console.log('Initializing database...');
    client = await pool.connect();
    
    await client.query('BEGIN');
    
    // Create employees table with better indexing
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_employees_emp_code ON employees(emp_code);
      CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
      CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
    `);

    // Create time_logs table with optimized indexing
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_time_logs_employee_id ON time_logs(employee_id);
      CREATE INDEX IF NOT EXISTS idx_time_logs_clock_in ON time_logs(clock_in);
      CREATE INDEX IF NOT EXISTS idx_time_logs_status ON time_logs(status);
    `);

    // Create settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        setting_name TEXT NOT NULL UNIQUE,
        setting_value TEXT,
        description TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_settings_name ON settings(setting_name);
    `);
    
    await client.query('COMMIT');
    
    // Initialize settings and sample data
    await addInitialSettings();
    await addSampleEmployees();
    
    console.log('Database initialization completed successfully');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Error initializing database:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

// Helper function to retry failed queries
async function queryWithRetry(queryFn, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await queryFn();
    } catch (err) {
      lastError = err;
      if (err.code === '40P01') { // Deadlock detected
        await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
  
  throw lastError;
}

// Add initial settings with better error handling
async function addInitialSettings() {
  const client = await pool.connect();
  try {
    const countResult = await client.query('SELECT COUNT(*) as count FROM settings');
    
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log('Adding initial settings...');
      
      const settings = [
        { name: 'organization_name', value: 'องค์การบริหารส่วนตำบลหัวนา', desc: 'ชื่อหน่วยงาน' },
        { name: 'liff_id', value: '2001032478-VR5Akj0k', desc: 'LINE LIFF ID' },
        { name: 'line_notify_token', value: '', desc: 'Token สำหรับ Line Notify' },
        { name: 'work_start_time', value: '08:30', desc: 'เวลาเริ่มงาน' },
        { name: 'work_end_time', value: '16:30', desc: 'เวลาเลิกงาน' },
        { name: 'allowed_ip', value: '', desc: 'IP Address ที่อนุญาต' },
        { name: 'telegram_bot_token', value: '', desc: 'Token สำหรับ Telegram Bot' },
        { name: 'telegram_groups', value: '[{"name":"กลุ่มหลัก","chat_id":"","active":true}]', desc: 'กลุ่มรับการแจ้งเตือน Telegram' },
        { name: 'notify_clock_in', value: '1', desc: 'แจ้งเตือนเมื่อลงเวลาเข้า' },
        { name: 'notify_clock_out', value: '1', desc: 'แจ้งเตือนเมื่อลงเวลาออก' },
        { name: 'admin_username', value: 'admin', desc: 'ชื่อผู้ใช้สำหรับแอดมิน' },
        { name: 'admin_password', value: 'admin123', desc: 'รหัสผ่านสำหรับแอดมิน' }
      ];
      
      await client.query('BEGIN');
      
      for (const setting of settings) {
        await client.query(
          'INSERT INTO settings (setting_name, setting_value, description) VALUES ($1, $2, $3)',
          [setting.name, setting.value, setting.desc]
        );
      }
      
      await client.query('COMMIT');
      console.log('Initial settings added successfully');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding initial settings:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Add sample employees with better error handling
async function addSampleEmployees() {
  const client = await pool.connect();
  try {
    const countResult = await client.query('SELECT COUNT(*) as count FROM employees');
    
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log('Adding sample employees...');
      
      const employees = [
        { code: '001', name: 'สมชาย ใจดี', position: 'ผู้จัดการ', department: 'บริหาร' },
        { code: '002', name: 'สมหญิง รักเรียน', position: 'เจ้าหน้าที่', department: 'ธุรการ' }
      ];
      
      await client.query('BEGIN');
      
      for (const emp of employees) {
        await client.query(
          'INSERT INTO employees (emp_code, full_name, position, department) VALUES ($1, $2, $3, $4)',
          [emp.code, emp.name, emp.position, emp.department]
        );
      }
      
      await client.query('COMMIT');
      console.log('Sample employees added successfully');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding sample employees:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Initialize database
initializeDatabase().catch(console.error);

// Export optimized query interface
const db = {
  query: (text, params) => queryWithRetry(() => pool.query(text, params)),
  getClient: () => pool.connect(),
  pool: pool,
  
  // Helper for transactions
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = db;