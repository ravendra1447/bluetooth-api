const express = require('express');
const router = express.Router();
const { validateProperty, validateMeter, validateTenantAssignment, validateOwnerUpdate } = require('../middleware/validation');

const checkMasterRole = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthenticated.' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    if (decoded.role !== 'master') return res.status(403).json({ success: false, message: 'Only master admin can access this resource.' });
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

router.use(checkMasterRole);

router.get('/dashboard', async (req, res) => {
  try {
    const [owners] = await req.app.locals.db.query("SELECT COUNT(*) as count FROM users WHERE role = 'owner'");
    const [tenants] = await req.app.locals.db.query("SELECT COUNT(*) as count FROM users WHERE role = 'tenant'");
    const [properties] = await req.app.locals.db.query('SELECT COUNT(*) as count FROM properties');
    const [meters] = await req.app.locals.db.query('SELECT COUNT(*) as count FROM meters');
    const [activeTenants] = await req.app.locals.db.query("SELECT COUNT(*) as count FROM tenants WHERE status = 'active'");

    res.json({
      success: true,
      data: {
        owners_count: owners[0].count,
        tenants_count: tenants[0].count,
        properties_count: properties[0].count,
        meters_count: meters[0].count,
        active_tenants: activeTenants[0].count
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/owners', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.per_page) || 20;
    const offset = (page - 1) * limit;

    const [owners] = await req.app.locals.db.query(
      `SELECT u.*, (SELECT COUNT(*) FROM properties WHERE ownerId = u.id) as owned_properties_count
       FROM users u 
       WHERE u.role = 'owner' 
       ORDER BY u.createdAt DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [count] = await req.app.locals.db.query("SELECT COUNT(*) as total FROM users WHERE role = 'owner'");

    res.json({ success: true, data: { current_page: page, data: owners, per_page: limit, total: count[0].total } });
  } catch (error) {
    console.error('List owners error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/owners', validateOwnerUpdate, async (req, res) => {
  try {
    const { name, phone, email, password, status } = req.body;
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await req.app.locals.db.query(
      'INSERT INTO users (name, phone, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email, hashedPassword, 'owner', status || 'active']
    );

    const [owners] = await req.app.locals.db.query('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', [result.insertId]);

    res.status(201).json({ success: true, message: 'Owner created successfully.', data: owners[0] });
  } catch (error) {
    console.error('Create owner error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/owners/:id', async (req, res) => {
  try {
    const [owners] = await req.app.locals.db.query('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'owner']);
    if (owners.length === 0) return res.status(404).json({ success: false, message: 'Owner not found.' });

    const owner = owners[0];
    const [properties] = await req.app.locals.db.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM meters WHERE propertyId = p.id) as meters_count,
        (SELECT COUNT(*) FROM tenants WHERE propertyId = p.id AND status = 'active') as tenants_count
       FROM properties p WHERE p.ownerId = ?`,
      [owner.id]
    );

    res.json({ success: true, data: { ...owner, owned_properties: properties } });
  } catch (error) {
    console.error('Get owner error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/owners/:id', validateOwnerUpdate, async (req, res) => {
  try {
    const { name, status } = req.body;
    await req.app.locals.db.query('UPDATE users SET name = ?, status = ? WHERE id = ? AND role = ?', [name, status, req.params.id, 'owner']);
    const [owners] = await req.app.locals.db.query('SELECT id, name, phone, email, role, status FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Owner updated successfully.', data: owners[0] });
  } catch (error) {
    console.error('Update owner error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/owners/:id', async (req, res) => {
  try {
    await req.app.locals.db.query('DELETE FROM users WHERE id = ? AND role = ?', [req.params.id, 'owner']);
    res.json({ success: true, message: 'Owner deleted successfully.' });
  } catch (error) {
    console.error('Delete owner error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Properties
router.get('/properties', async (req, res) => {
  try {
    const { ownerId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.per_page) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, u.name as owner_name, u.phone as owner_mobile,
        (SELECT COUNT(*) FROM tenants WHERE propertyId = p.id AND status = 'active') as active_tenants_count,
        (SELECT COUNT(*) FROM meters WHERE propertyId = p.id) as electricity_meters_count
      FROM properties p JOIN users u ON p.ownerId = u.id
    `;
    const params = [];

    if (ownerId) { query += ' WHERE p.ownerId = ?'; params.push(ownerId); }
    query += ' ORDER BY p.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [properties] = await req.app.locals.db.query(query, params);
    const [count] = await req.app.locals.db.query('SELECT COUNT(*) as total FROM properties');

    res.json({ success: true, data: { current_page: page, data: properties, per_page: limit, total: count[0].total } });
  } catch (error) {
    console.error('List properties error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/properties', validateProperty, async (req, res) => {
  try {
    const { ownerId, propertyName, address, city, state, pincode, rent, status } = req.body;
    const propertyCode = 'PROP-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const [result] = await req.app.locals.db.query(
      `INSERT INTO properties (ownerId, propertyCode, propertyName, address, city, state, pincode, rent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, propertyCode, propertyName, address, city, state, pincode, rent || 0, status || 'active']
    );

    const [properties] = await req.app.locals.db.query('SELECT * FROM properties WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Property created successfully.', data: properties[0] });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/properties/:id', async (req, res) => {
  try {
    const [properties] = await req.app.locals.db.query(
      `SELECT p.*, u.name as owner_name, u.phone as owner_mobile FROM properties p JOIN users u ON p.ownerId = u.id WHERE p.id = ?`,
      [req.params.id]
    );

    if (properties.length === 0) return res.status(404).json({ success: false, message: 'Property not found.' });
    const property = properties[0];
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE propertyId = ?', [property.id]);
    const [tenants] = await req.app.locals.db.query(
      `SELECT pt.*, u.name as tenant_name, u.phone as tenant_mobile FROM tenants pt JOIN users u ON pt.userId = u.id WHERE pt.propertyId = ?`,
      [property.id]
    );

    res.json({ success: true, data: { ...property, electricity_meters: meters, tenants } });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/properties/:id', validateProperty, async (req, res) => {
  try {
    const { propertyName, rent, status } = req.body;
    await req.app.locals.db.query('UPDATE properties SET propertyName = ?, rent = ?, status = ? WHERE id = ?', [propertyName, rent, status, req.params.id]);
    const [properties] = await req.app.locals.db.query('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Property updated successfully.', data: properties[0] });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/properties/:id', async (req, res) => {
  try {
    await req.app.locals.db.query('DELETE FROM properties WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Property deleted successfully.' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/properties/:id/regenerate-code', async (req, res) => {
  try {
    const propertyCode = 'PROP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    await req.app.locals.db.query('UPDATE properties SET propertyCode = ? WHERE id = ?', [propertyCode, req.params.id]);
    res.json({ success: true, message: 'Property code regenerated.', data: { propertyCode } });
  } catch (error) {
    console.error('Regenerate code error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Tenants
router.get('/tenants', async (req, res) => {
  try {
    const { propertyId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.per_page) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT pt.*, u.name as tenant_name, u.phone as tenant_mobile, p.propertyName as property_name, p.propertyCode as property_code
      FROM tenants pt JOIN users u ON pt.userId = u.id JOIN properties p ON pt.propertyId = p.id
    `;
    const params = [];

    if (propertyId) { query += ' WHERE pt.propertyId = ?'; params.push(propertyId); }
    query += ' ORDER BY pt.moveInDate DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [tenants] = await req.app.locals.db.query(query, params);
    const [count] = await req.app.locals.db.query('SELECT COUNT(*) as total FROM tenants');

    res.json({ success: true, data: { current_page: page, data: tenants, per_page: limit, total: count[0].total } });
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/tenants', validateTenantAssignment, async (req, res) => {
  try {
    const { name, phone, email, password, propertyId, moveInDate, status } = req.body;
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await req.app.locals.db.query(
      'INSERT INTO users (name, phone, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email, hashedPassword, 'tenant', 'active']
    );

    await req.app.locals.db.query(
      'INSERT INTO tenants (propertyId, userId, moveInDate, status) VALUES (?, ?, ?, ?)',
      [propertyId, result.insertId, moveInDate || new Date(), status || 'active']
    );

    const [tenants] = await req.app.locals.db.query(
      `SELECT pt.*, u.name as tenant_name, u.phone as tenant_mobile, p.propertyName as property_name
       FROM tenants pt JOIN users u ON pt.userId = u.id JOIN properties p ON pt.propertyId = p.id WHERE pt.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, message: 'Tenant created and linked to property.', data: tenants[0] });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/tenants/:id', async (req, res) => {
  try {
    const { moveInDate, status } = req.body;
    await req.app.locals.db.query('UPDATE tenants SET moveInDate = ?, status = ? WHERE id = ?', [moveInDate, status, req.params.id]);
    const [tenants] = await req.app.locals.db.query('SELECT * FROM tenants WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Tenant assignment updated.', data: tenants[0] });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/tenants/:id', async (req, res) => {
  try {
    await req.app.locals.db.query('DELETE FROM tenants WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Tenant removed successfully.' });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Meters
router.get('/meters', async (req, res) => {
  try {
    const { propertyId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.per_page) || 20;
    const offset = (page - 1) * limit;

    let query = `SELECT em.*, p.propertyName as property_name, p.propertyCode as property_code FROM meters em JOIN properties p ON em.propertyId = p.id`;
    const params = [];

    if (propertyId) { query += ' WHERE em.propertyId = ?'; params.push(propertyId); }
    query += ' ORDER BY em.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [meters] = await req.app.locals.db.query(query, params);
    const [count] = await req.app.locals.db.query('SELECT COUNT(*) as total FROM meters');

    res.json({ success: true, data: { current_page: page, data: meters, per_page: limit, total: count[0].total } });
  } catch (error) {
    console.error('List meters error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/meters', validateMeter, async (req, res) => {
  try {
    const { propertyId, meterNumber, bluetoothId, meterType, balance, tariff, status } = req.body;
    const [result] = await req.app.locals.db.query(
      `INSERT INTO meters (propertyId, meterNumber, bluetoothId, meterType, balance, tariff, currentReading, lastReading, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [propertyId, meterNumber, bluetoothId, meterType || 'prepaid', balance || 0, tariff || 0, status || 'active']
    );

    const [meters] = await req.app.locals.db.query(`SELECT em.*, p.propertyName as property_name, p.propertyCode as property_code FROM meters em JOIN properties p ON em.propertyId = p.id WHERE em.id = ?`, [result.insertId]);
    res.status(201).json({ success: true, message: 'Meter created successfully.', data: meters[0] });
  } catch (error) {
    console.error('Create meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/meters/:id', validateMeter, async (req, res) => {
  try {
    const { balance, status } = req.body;
    await req.app.locals.db.query('UPDATE meters SET balance = ?, status = ? WHERE id = ?', [balance, status, req.params.id]);
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Meter updated successfully.', data: meters[0] });
  } catch (error) {
    console.error('Update meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/meters/:id', async (req, res) => {
  try {
    await req.app.locals.db.query('DELETE FROM meters WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Meter deleted successfully.' });
  } catch (error) {
    console.error('Delete meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const [payments] = await req.app.locals.db.query(
      `SELECT p.id, p.amount, p.paymentMethod, p.status, p.createdAt,
              b.month, b.year, em.meterNumber, pr.propertyName, u.name as ownerName
       FROM payments p
       JOIN bills b ON p.billId = b.id
       JOIN meters em ON b.meterId = em.id
       JOIN properties pr ON em.propertyId = pr.id
       JOIN users u ON pr.ownerId = u.id
       ORDER BY p.createdAt DESC`
    );
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Master reports error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
