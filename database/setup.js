const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔧 Setting up MySQL database...');

    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'meter_db'}`);
    console.log('✅ Database created');

    // Use the database
    await connection.query(`USE ${process.env.DB_NAME || 'meter_db'}`);

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mobile VARCHAR(10) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('master', 'owner', 'tenant') DEFAULT 'tenant',
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created');

    // Create properties table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        property_code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        monthly_rent DECIMAL(10, 2) DEFAULT 0,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Properties table created');

    // Create property_tenants table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS property_tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        tenant_id INT NOT NULL,
        move_in_date DATE,
        move_out_date DATE,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_property_tenant (property_id, tenant_id)
      )
    `);
    console.log('✅ Property tenants table created');

    // Create electricity_meters table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS electricity_meters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        property_id INT NOT NULL,
        meter_name VARCHAR(255) NOT NULL,
        meter_number VARCHAR(50) UNIQUE NOT NULL,
        model_number VARCHAR(100),
        series_number VARCHAR(100) UNIQUE,
        meter_type ENUM('prepaid', 'postpaid') DEFAULT 'prepaid',
        initial_balance DECIMAL(10, 2) DEFAULT 0,
        current_balance DECIMAL(10, 2) DEFAULT 0,
        tariff_per_unit DECIMAL(10, 2) DEFAULT 0,
        last_reading DECIMAL(10, 2) DEFAULT 0,
        relay_status ENUM('ON', 'OFF') DEFAULT 'ON',
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Electricity meters table created');

    // Create bills table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meter_id INT NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        previous_reading DECIMAL(10, 2) DEFAULT 0,
        current_reading DECIMAL(10, 2) DEFAULT 0,
        units DECIMAL(10, 2) DEFAULT 0,
        rate DECIMAL(10, 2) DEFAULT 0,
        amount DECIMAL(10, 2) DEFAULT 0,
        previous_due DECIMAL(10, 2) DEFAULT 0,
        paid_amount DECIMAL(10, 2) DEFAULT 0,
        outstanding DECIMAL(10, 2) DEFAULT 0,
        due_date DATE,
        status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (meter_id) REFERENCES electricity_meters(id) ON DELETE CASCADE,
        UNIQUE KEY unique_meter_month_year (meter_id, month, year)
      )
    `);
    console.log('✅ Bills table created');

    // Create payments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('UPI', 'Credit/Debit Card', 'Net Banking', 'Wallet', 'Cash') NOT NULL,
        transaction_id VARCHAR(100),
        status ENUM('success', 'failed', 'pending') DEFAULT 'success',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Payments table created');

    // Create relay_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS relay_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meter_id INT NOT NULL,
        relay_status ENUM('ON', 'OFF') NOT NULL,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meter_id) REFERENCES electricity_meters(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Relay logs table created');

    // Insert default master user
    const [existingMaster] = await connection.query('SELECT id FROM users WHERE mobile = ?', ['9999999999']);
    if (existingMaster.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('master123', 10);
      await connection.query(
        'INSERT INTO users (name, mobile, password, role, is_active) VALUES (?, ?, ?, ?, ?)',
        ['Master Admin', '9999999999', hashedPassword, 'master', 1]
      );
      console.log('✅ Default master user created (9999999999 / master123)');
    }

    console.log('🎉 Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run setup
setupDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
