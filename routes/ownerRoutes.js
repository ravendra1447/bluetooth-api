const express = require('express');
const router = express.Router();
const { validateProperty, validateMeter } = require('../middleware/validation');

const checkOwnerRole = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthenticated.' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    if (decoded.role !== 'owner') return res.status(403).json({ success: false, message: 'Only property owners can access this resource.' });
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

router.use(checkOwnerRole);

router.get('/properties', async (req, res) => {
  try {
    const [properties] = await req.app.locals.db.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM tenants WHERE propertyId = p.id AND status = 'active') as active_tenants_count,
        (SELECT COUNT(*) FROM meters WHERE propertyId = p.id) as electricity_meters_count
       FROM properties p 
       WHERE p.ownerId = ? 
       ORDER BY p.createdAt DESC`,
      [req.userId]
    );
    res.json({ success: true, data: properties });
  } catch (error) {
    console.error('List properties error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/properties', validateProperty, async (req, res) => {
  try {
    const { propertyName, address, city, state, pincode, rent, status } = req.body;
    const propertyCode = 'PROP-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const [result] = await req.app.locals.db.query(
      `INSERT INTO properties (ownerId, propertyCode, propertyName, address, city, state, pincode, rent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, propertyCode, propertyName, address, city, state, pincode, rent || 0, status || 'active']
    );

    const [properties] = await req.app.locals.db.query('SELECT * FROM properties WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Property created successfully. Share the property code with your tenant.',
      data: properties[0]
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/properties/:id', async (req, res) => {
  try {
    const [properties] = await req.app.locals.db.query(
      'SELECT * FROM properties WHERE id = ? AND ownerId = ?',
      [req.params.id, req.userId]
    );

    if (properties.length === 0) return res.status(404).json({ success: false, message: 'Property not found.' });
    const property = properties[0];

    const [tenants] = await req.app.locals.db.query(
      `SELECT pt.*, u.name, u.phone, u.email 
       FROM tenants pt 
       JOIN users u ON pt.userId = u.id 
       WHERE pt.propertyId = ? AND pt.status = 'active'`,
      [property.id]
    );

    const [meters] = await req.app.locals.db.query(
      'SELECT * FROM meters WHERE propertyId = ?',
      [property.id]
    );

    res.json({ success: true, data: { ...property, active_tenants: tenants, electricity_meters: meters } });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/properties/:id', validateProperty, async (req, res) => {
  try {
    const { propertyName, address, city, state, pincode, rent, status } = req.body;
    await req.app.locals.db.query(
      `UPDATE properties SET propertyName = ?, address = ?, city = ?, state = ?, pincode = ?, rent = ?, status = ?
       WHERE id = ? AND ownerId = ?`,
      [propertyName, address, city, state, pincode, rent, status, req.params.id, req.userId]
    );
    const [properties] = await req.app.locals.db.query('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Property updated successfully.', data: properties[0] });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/properties/:id/regenerate-code', async (req, res) => {
  try {
    const propertyCode = 'PROP-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    await req.app.locals.db.query(
      'UPDATE properties SET propertyCode = ? WHERE id = ? AND ownerId = ?',
      [propertyCode, req.params.id, req.userId]
    );
    res.json({ success: true, message: 'Property code regenerated successfully.', data: { propertyCode } });
  } catch (error) {
    console.error('Regenerate code error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/properties/:id/tenants', async (req, res) => {
  try {
    const [tenants] = await req.app.locals.db.query(
      `SELECT pt.*, u.name, u.phone, u.email 
       FROM tenants pt 
       JOIN users u ON pt.userId = u.id 
       WHERE pt.propertyId = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: tenants });
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/properties/:id/meters', async (req, res) => {
  try {
    const [meters] = await req.app.locals.db.query(
      'SELECT * FROM meters WHERE propertyId = ?',
      [req.params.id]
    );
    res.json({ success: true, data: meters });
  } catch (error) {
    console.error('List meters error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/properties/:id/meters', validateMeter, async (req, res) => {
  try {
    const { meterNumber, bluetoothId, meterType, tariff, balance, status } = req.body;
    const [result] = await req.app.locals.db.query(
      `INSERT INTO meters (propertyId, meterNumber, bluetoothId, meterType, balance, tariff, currentReading, lastReading, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [req.params.id, meterNumber, bluetoothId, meterType || 'prepaid', balance || 0, tariff || 0, status || 'active']
    );
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Electricity meter added successfully.', data: meters[0] });
  } catch (error) {
    console.error('Add meter error:', error);
    if (error.code === 'ER_DUP_ENTRY') return res.status(422).json({ success: false, message: 'Meter number already exists.' });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/meters/:id', async (req, res) => {
  try {
    const [meters] = await req.app.locals.db.query(
      `SELECT em.*, p.propertyName as property_name, p.propertyCode as property_code 
       FROM meters em 
       JOIN properties p ON em.propertyId = p.id 
       WHERE em.id = ? AND p.ownerId = ?`,
      [req.params.id, req.userId]
    );
    if (meters.length === 0) return res.status(404).json({ success: false, message: 'Meter not found.' });
    res.json({ success: true, data: meters[0] });
  } catch (error) {
    console.error('Get meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/meters/:id', validateMeter, async (req, res) => {
  try {
    const { tariff, status, meterNumber, bluetoothId, meterType } = req.body;
    await req.app.locals.db.query(
      `UPDATE meters SET tariff = ?, status = ?, meterNumber = ?, bluetoothId = ?, meterType = ? WHERE id = ?`,
      [tariff, status, meterNumber, bluetoothId, meterType, req.params.id]
    );
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Electricity meter updated successfully.', data: meters[0] });
  } catch (error) {
    console.error('Update meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/meters/:id', async (req, res) => {
  try {
    await req.app.locals.db.query('DELETE FROM meters WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Electricity meter deleted successfully.' });
  } catch (error) {
    console.error('Delete meter error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/meters/:id/generate-bill', async (req, res) => {
  try {
    const { month, year, currentReading } = req.body;
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE id = ?', [req.params.id]);
    if (meters.length === 0) return res.status(404).json({ success: false, message: 'Meter not found.' });
    const meter = meters[0];

    const [lastBills] = await req.app.locals.db.query(
      'SELECT * FROM bills WHERE meterId = ? ORDER BY id DESC LIMIT 1',
      [meter.id]
    );

    const previousReading = lastBills.length > 0 ? lastBills[0].currentReading : meter.lastReading;
    const previousDue = lastBills.length > 0 ? lastBills[0].outstanding : 0;
    const units = Number(currentReading) - Number(previousReading);
    const amount = units * Number(meter.tariff);
    const outstanding = amount + Number(previousDue);
    const dueDate = new Date(year, month, 7);

    const [existingBills] = await req.app.locals.db.query(
      'SELECT * FROM bills WHERE meterId = ? AND month = ? AND year = ?',
      [meter.id, month, year]
    );
    if (existingBills.length > 0) return res.status(422).json({ success: false, message: 'Bill already exists for this month/year.' });

    const [result] = await req.app.locals.db.query(
      `INSERT INTO bills (meterId, month, year, previousReading, currentReading, units, rate, amount, previousDue, outstanding, dueDate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [meter.id, month, year, previousReading, currentReading, units, meter.tariff, amount, previousDue, outstanding, dueDate, 'pending']
    );

    await req.app.locals.db.query(
      'UPDATE meters SET lastReading = ? WHERE id = ?',
      [currentReading, meter.id]
    );

    const [bills] = await req.app.locals.db.query('SELECT * FROM bills WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Bill generated successfully.', data: bills[0] });
  } catch (error) {
    console.error('Generate bill error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/properties/:id/bills', async (req, res) => {
  try {
    const [bills] = await req.app.locals.db.query(
      `SELECT b.*, em.meterNumber
       FROM bills b 
       JOIN meters em ON b.meterId = em.id 
       WHERE em.propertyId = ? 
       ORDER BY b.year DESC, b.month DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
