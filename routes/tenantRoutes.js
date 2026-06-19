const express = require('express');
const router = express.Router();

const checkTenantRole = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthenticated.' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    if (decoded.role !== 'tenant') return res.status(403).json({ success: false, message: 'Only tenants can access this resource.' });
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

router.use(checkTenantRole);

router.get('/property', async (req, res) => {
  try {
    const [assignments] = await req.app.locals.db.query(
      `SELECT pt.*, p.propertyCode as property_code, p.propertyName as name, p.address, p.rent as monthly_rent, u.name as owner_name, u.phone as owner_mobile
       FROM tenants pt 
       JOIN properties p ON pt.propertyId = p.id 
       JOIN users u ON p.ownerId = u.id
       WHERE pt.userId = ? AND pt.status = 'active'`,
      [req.userId]
    );

    if (assignments.length === 0) return res.status(404).json({ success: false, message: 'No active property linked to your account.' });

    const assignment = assignments[0];
    res.json({
      success: true,
      data: {
        assignment: {
          id: assignment.id,
          property_id: assignment.propertyId,
          tenant_id: assignment.userId,
          move_in_date: assignment.moveInDate,
          status: assignment.status
        },
        property: {
          id: assignment.propertyId,
          property_code: assignment.property_code,
          name: assignment.name,
          address: assignment.address,
          monthly_rent: assignment.monthly_rent
        },
        owner: {
          name: assignment.owner_name,
          mobile: assignment.owner_mobile
        }
      }
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/meters', async (req, res) => {
  try {
    const [assignments] = await req.app.locals.db.query(
      'SELECT propertyId FROM tenants WHERE userId = ? AND status = "active"',
      [req.userId]
    );

    if (assignments.length === 0) return res.status(404).json({ success: false, message: 'No active property linked to your account.' });

    const propertyId = assignments[0].propertyId;
    const [meters] = await req.app.locals.db.query('SELECT * FROM meters WHERE propertyId = ?', [propertyId]);

    res.json({ success: true, data: meters });
  } catch (error) {
    console.error('Get meters error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/bills', async (req, res) => {
  try {
    const [assignments] = await req.app.locals.db.query(
      'SELECT propertyId FROM tenants WHERE userId = ? AND status = "active"',
      [req.userId]
    );

    if (assignments.length === 0) return res.status(404).json({ success: false, message: 'No active property linked to your account.' });

    const propertyId = assignments[0].propertyId;
    const [bills] = await req.app.locals.db.query(
      `SELECT b.*, em.meterNumber as meter_number, em.relayStatus as relay_status 
       FROM bills b 
       JOIN meters em ON b.meterId = em.id 
       WHERE em.propertyId = ? 
       ORDER BY b.year DESC, b.month DESC`,
      [propertyId]
    );

    res.json({ success: true, data: bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/current-bill', async (req, res) => {
  try {
    const [assignments] = await req.app.locals.db.query(
      'SELECT propertyId FROM tenants WHERE userId = ? AND status = "active"',
      [req.userId]
    );

    if (assignments.length === 0) return res.status(404).json({ success: false, message: 'No active property linked to your account.' });

    const propertyId = assignments[0].propertyId;
    const [bills] = await req.app.locals.db.query(
      `SELECT b.*, em.meterNumber as meter_number, em.relayStatus as relay_status, em.balance as current_balance 
       FROM bills b 
       JOIN meters em ON b.meterId = em.id 
       WHERE em.propertyId = ? AND b.status = 'pending' 
       ORDER BY b.year DESC, b.month DESC 
       LIMIT 1`,
      [propertyId]
    );

    if (bills.length === 0) return res.json({ success: true, data: null, message: 'No pending bills.' });

    res.json({ success: true, data: bills[0] });
  } catch (error) {
    console.error('Get current bill error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
