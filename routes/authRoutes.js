const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  validateOwnerRegistration,
  validateTenantRegistration,
  validateLogin
} = require('../middleware/validation');

// API Info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Prepaid Meter & Tenant Billing API',
    version: '1.0',
    note: 'Use Master Web Panel for full management. Login: 9999999999 / master123'
  });
});

// Owner Register
router.post('/owner/register', validateOwnerRegistration, async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    const [existingUser] = await req.app.locals.db.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingUser.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Phone number already exists.',
        errors: { phone: ['The phone has already been taken.'] }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await req.app.locals.db.query(
      'INSERT INTO users (name, phone, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email || null, hashedPassword, 'owner', 'active']
    );

    const token = jwt.sign(
      { userId: result.insertId, role: 'owner' },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    const [users] = await req.app.locals.db.query('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Owner registered successfully.',
      data: {
        user: users[0],
        token
      }
    });
  } catch (error) {
    console.error('Owner registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Tenant Register
router.post('/tenant/register', validateTenantRegistration, async (req, res) => {
  try {
    const { name, phone, email, password, propertyCode, moveInDate } = req.body;

    const [existingUser] = await req.app.locals.db.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingUser.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Phone number already exists.',
        errors: { phone: ['The phone has already been taken.'] }
      });
    }

    const [properties] = await req.app.locals.db.query(
      'SELECT id, propertyName FROM properties WHERE propertyCode = ? AND status = ?',
      [propertyCode, 'active']
    );
    if (properties.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid or inactive property code.'
      });
    }

    const property = properties[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await req.app.locals.db.query(
      'INSERT INTO users (name, phone, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email || null, hashedPassword, 'tenant', 'active']
    );

    await req.app.locals.db.query(
      'INSERT INTO tenants (propertyId, userId, moveInDate, status) VALUES (?, ?, ?, ?)',
      [property.id, result.insertId, moveInDate || new Date(), 'active']
    );

    const token = jwt.sign(
      { userId: result.insertId, role: 'tenant' },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    const [users] = await req.app.locals.db.query('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Tenant registered and linked to property successfully.',
      data: {
        user: users[0],
        property: property,
        token
      }
    });
  } catch (error) {
    console.error('Tenant registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { phone, password } = req.body;

    const [users] = await req.app.locals.db.query(
      'SELECT id, name, phone, email, password, role, status FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password.'
      });
    }

    const user = users[0];

    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your account is inactive.'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password.'
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          status: user.status
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get Current User (Me)
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthenticated.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');

    const [users] = await req.app.locals.db.query(
      'SELECT id, name, phone, email, role, status FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    const user = users[0];

    if (user.role === 'owner') {
      const [properties] = await req.app.locals.db.query(
        'SELECT COUNT(*) as count FROM properties WHERE ownerId = ?',
        [user.id]
      );
      res.json({ success: true, data: { user, properties_count: properties[0].count } });
    } else if (user.role === 'tenant') {
      const [assignments] = await req.app.locals.db.query(
        `SELECT pt.*, p.propertyCode as property_code, p.propertyName as name, p.address, p.rent as monthly_rent 
         FROM tenants pt 
         JOIN properties p ON pt.propertyId = p.id 
         WHERE pt.userId = ? AND pt.status = ?`,
        [user.id, 'active']
      );

      if (assignments.length === 0) {
        return res.status(404).json({ success: false, message: 'No active property linked to your account.' });
      }

      const assignment = assignments[0];
      const [meters] = await req.app.locals.db.query(
        'SELECT * FROM meters WHERE propertyId = ?',
        [assignment.propertyId]
      );

      res.json({ success: true, data: { user, property: assignment, meters } });
    } else {
      res.json({ success: true, data: { user } });
    }
  } catch (error) {
    console.error('Get me error:', error);
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token.' });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
