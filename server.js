require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/authRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const masterRoutes = require('./routes/masterRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'bluetooth_user',
  password: process.env.DB_PASSWORD || 'Bangkokmart@123',
  database: process.env.DB_NAME || 'bluetooth_api_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL Connected');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL Connection Error:', err.message);
  });

// Make pool available to routes
app.locals.db = pool;

// Routes
app.use('/api', authRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await req.app.locals.db.query('SELECT 1 as status');
    res.json({ 
      status: 'OK', 
      message: 'Prepaid Meter & Tenant Billing API is running',
      database: 'MySQL Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
});
