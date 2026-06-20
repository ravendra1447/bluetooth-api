require('dotenv').config();
const db = require('./config/db');

async function testConnection() {
    try {
        console.log("Attempting to connect to the database...");
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        console.log("Database connection successful! Result:", rows[0].result);
        
        // Also check if tables exist
        const [tables] = await db.query('SHOW TABLES');
        console.log("Existing tables in database:");
        console.log(tables);

    } catch (error) {
        console.error("Database connection failed:");
        console.error(error.message);
    } finally {
        process.exit();
    }
}

testConnection();
