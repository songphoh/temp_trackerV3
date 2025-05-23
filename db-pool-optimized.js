// db-pool-optimized.js - Optimized Database Connection Pool

const { Pool } = require('pg');

class OptimizedDatabasePool {
  constructor() {
    this.pool = null;
    this.preparedStatements = {};
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // 1 second
    
    this.initializePool();
    this.setupPreparedStatements();
  }

  initializePool() {
    // Database configuration
    const dbConfig = {
      // Production database URL from environment
      connectionString: process.env.DATABASE_URL,
      
      // Connection pool settings
      max: parseInt(process.env.DB_POOL_MAX) || 20, // maximum number of clients
      min: parseInt(process.env.DB_POOL_MIN) || 2,  // minimum number of clients
      idleTimeoutMillis: 30000, // close idle clients after 30 seconds
      connectionTimeoutMillis: 5000, // return an error after 5 seconds if connection could not be established
      maxUses: 7500, // close (and replace) a connection after it has been used 7500 times
      
      // SSL configuration for production
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false,
      
      // Statement timeout
      statement_timeout: 30000, // 30 seconds
      query_timeout: 30000, // 30 seconds
      
      // Application name for monitoring
      application_name: 'mobile_time_tracker'
    };

    // Fallback to individual connection parameters if DATABASE_URL not available
    if (!dbConfig.connectionString) {
      delete dbConfig.connectionString;
      dbConfig.host = process.env.DB_HOST || 'localhost';
      dbConfig.port = parseInt(process.env.DB_PORT) || 5432;
      dbConfig.database = process.env.DB_NAME || 'timetracker';
      dbConfig.user = process.env.DB_USER || 'postgres';
      dbConfig.password = process.env.DB_PASSWORD || 'password';
    }

    console.log('📊 Initializing database pool with config:');
    console.log(`   - Max connections: ${dbConfig.max}`);
    console.log(`   - Min connections: ${dbConfig.min}`);
    console.log(`   - SSL: ${dbConfig.ssl ? 'enabled' : 'disabled'}`);
    console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);

    this.pool = new Pool(dbConfig);
    
    this.setupPoolEventHandlers();
  }

  setupPoolEventHandlers() {
    // Connection successful
    this.pool.on('connect', (client) => {
      console.log('🔗 New database client connected');
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    // Connection error
    this.pool.on('error', (err, client) => {
      console.error('❌ Database pool error:', err.message);
      this.connected = false;
      this.handleConnectionError(err);
    });

    // Client removed from pool
    this.pool.on('remove', (client) => {
      console.log('🔌 Database client removed from pool');
    });

    // Acquire client
    this.pool.on('acquire', (client) => {
      console.log('📋 Database client acquired from pool');
    });
  }

  async handleConnectionError(error) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
      
      setTimeout(() => {
        this.testConnection();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached. Manual intervention required.');
    }
  }

  async testConnection() {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      console.log('✅ Database connection restored');
      this.connected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      this.handleConnectionError(error);
    }
  }

  setupPreparedStatements() {
    // Define all prepared statements used by the application
    this.preparedStatements = {
      // Employee queries
      GET_EMPLOYEE_BY_CODE: 'SELECT id, full_name, emp_code, position, department FROM employees WHERE (emp_code = $1 OR full_name = $1) AND status = \'active\' LIMIT 1',
      GET_ACTIVE_EMPLOYEES: 'SELECT full_name, emp_code FROM employees WHERE status = $1 ORDER BY full_name',
      GET_EMPLOYEE_NAMES: 'SELECT full_name FROM employees WHERE status = $1 ORDER BY full_name',
      
      // Time log queries
      CHECK_CLOCK_IN_TODAY: 'SELECT id FROM time_logs WHERE employee_id = $1 AND DATE(clock_in) = $2 LIMIT 1',
      GET_TODAY_RECORD: 'SELECT id, clock_out, clock_in FROM time_logs WHERE employee_id = $1 AND DATE(clock_in) = $2 ORDER BY clock_in DESC LIMIT 1',
      INSERT_TIME_LOG: 'INSERT INTO time_logs (employee_id, clock_in, note, latitude_in, longitude_in, line_name, line_picture, status) VALUES ($1, $2, $3, $4, $5, $6, $7, \'normal\') RETURNING id',
      UPDATE_CLOCK_OUT: 'UPDATE time_logs SET clock_out = $1, latitude_out = $2, longitude_out = $3, line_name = COALESCE($4, line_name), line_picture = COALESCE($5, line_picture) WHERE id = $6',
      
      // Mobile-specific queries
      GET_EMPLOYEE_STATUS_TODAY: `
        SELECT 
          tl.clock_in, 
          tl.clock_out, 
          tl.note,
          e.full_name,
          e.emp_code
        FROM time_logs tl 
        JOIN employees e ON tl.employee_id = e.id 
        WHERE e.id = $1 AND DATE(tl.clock_in) = $2 
        ORDER BY tl.clock_in DESC 
        LIMIT 1
      `,
      
      GET_EMPLOYEE_HISTORY: `
        SELECT 
          tl.clock_in, 
          tl.clock_out, 
          tl.note, 
          tl.status,
          DATE(tl.clock_in) as work_date
        FROM time_logs tl 
        WHERE tl.employee_id = $1 
        ORDER BY tl.clock_in DESC 
        LIMIT $2
      `,
      
      // Admin queries
      GET_DASHBOARD_STATS: `
        SELECT 
          COUNT(DISTINCT e.id) as total_employees,
          COUNT(DISTINCT CASE WHEN DATE(tl.clock_in) = $1 THEN tl.employee_id END) as checked_in_today,
          COUNT(CASE WHEN DATE(tl.clock_in) = $1 AND tl.clock_out IS NULL THEN 1 END) as not_checked_out_today
        FROM employees e 
        LEFT JOIN time_logs tl ON e.id = tl.employee_id 
        WHERE e.status = 'active'
      `
    };

    console.log('📋 Prepared statements initialized');
  }

  // Main query method with automatic retry
  async query(text, params = [], maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const start = Date.now();
        const result = await this.pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries
        if (duration > 1000) {
          console.warn(`🐌 Slow query (${duration}ms): ${text.substring(0, 100)}...`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Query attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        // Don't retry for certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // Exponential backoff
          console.log(`⏳ Retrying query in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  isNonRetryableError(error) {
    const nonRetryableErrors = [
      'syntax error',
      'column does not exist',
      'relation does not exist',
      'permission denied',
      'duplicate key value'
    ];
    
    return nonRetryableErrors.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  // Transaction wrapper
  async withTransaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Batch query execution
  async batchQuery(queries) {
    const client = await this.pool.connect();
    const results = [];
    
    try {
      await client.query('BEGIN');
      
      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Connection health check
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as status, NOW() as timestamp');
      return {
        healthy: true,
        timestamp: result.rows[0].timestamp,
        poolInfo: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        poolInfo: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        }
      };
    }
  }

  // Get pool statistics
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // Utility method for sleeping
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Graceful shutdown
  async close() {
    console.log('🔐 Closing database pool...');
    
    try {
      await this.pool.end();
      console.log('✅ Database pool closed successfully');
    } catch (error) {
      console.error('❌ Error closing database pool:', error);
      throw error;
    }
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    setInterval(() => {
      const stats = this.getPoolStats();
      
      if (stats.waitingCount > 5) {
        console.warn(`⚠️ High database queue: ${stats.waitingCount} waiting connections`);
      }
      
      if (stats.totalCount > stats.idleCount + 2 && stats.idleCount < 2) {
        console.warn(`⚠️ Low database idle connections: ${stats.idleCount} idle out of ${stats.totalCount} total`);
      }
      
    }, 30000); // Check every 30 seconds
  }

  // Method to execute prepared statements safely
  async executePrepared(statementName, params = []) {
    const statement = this.preparedStatements[statementName];
    
    if (!statement) {
      throw new Error(`Prepared statement '${statementName}' not found`);
    }
    
    return await this.query(statement, params);
  }
}

// Create and export a singleton instance
const db = new OptimizedDatabasePool();

// Start performance monitoring in production
if (process.env.NODE_ENV === 'production') {
  db.startPerformanceMonitoring();
}

// Export the instance and Pool class
module.exports = db;
module.exports.OptimizedDatabasePool = OptimizedDatabasePool;