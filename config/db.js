require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST || '184.168.126.71',
    user: process.env.DB_USER || 'bluetooth_user',
    password: process.env.DB_PASSWORD || 'Bangkokmart@123',
    database: process.env.DB_NAME || 'bluetooth_api_db',
    connectionLimit: 10
});

module.exports = db.promise();
