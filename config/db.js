require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST || '184.168.126.71',
    user: process.env.DB_USER || 'bluetooth_user',
    password: process.env.DB_PASSWORD || 'Bangkokmart@123',
    database: process.env.DB_NAME || 'bluetooth_api_db',
    connectionLimit: 10
});

const promisePool = db.promise();

// Auto-create global_schedule table if it doesn't exist
promisePool.query(`
    CREATE TABLE IF NOT EXISTS global_schedule (
        id INT PRIMARY KEY DEFAULT 1,
        disconnect_date VARCHAR(20) DEFAULT 'Today',
        disconnect_time VARCHAR(20) DEFAULT '12:00 PM',
        reconnect_date VARCHAR(20) DEFAULT 'Today',
        reconnect_time VARCHAR(20) DEFAULT '01:00 PM',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`).then(() => {
    // Ensure at least one row exists
    return promisePool.query('INSERT IGNORE INTO global_schedule (id) VALUES (1)');
}).then(() => {
    // Auto-create system_logs table
    return promisePool.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}).catch(err => {
    console.error('Failed to initialize database tables:', err);
});

module.exports = promisePool;
