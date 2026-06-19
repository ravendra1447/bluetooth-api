const express = require('express');
const router = express.Router();

const checkAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthenticated.' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

router.use(checkAuth);

router.post('/pay', async (req, res) => {
  try {
    const { billId, amount, paymentMethod, transactionId } = req.body;

    if (!billId || !amount || !paymentMethod) {
      return res.status(422).json({ success: false, message: 'billId, amount, and paymentMethod are required.' });
    }

    const [billRows] = await req.app.locals.db.query('SELECT * FROM bills WHERE id = ?', [billId]);
    if (billRows.length === 0) return res.status(404).json({ success: false, message: 'Bill not found.' });
    const bill = billRows[0];

    const paidAmount = Number(bill.paidAmount) + Number(amount);
    const outstanding = Number(bill.amount) + Number(bill.previousDue) - paidAmount;
    let status = outstanding <= 0 ? 'paid' : 'pending';

    await req.app.locals.db.query(
      'UPDATE bills SET paidAmount = ?, outstanding = ?, status = ? WHERE id = ?',
      [paidAmount, outstanding, status, billId]
    );

    await req.app.locals.db.query(
      'INSERT INTO payments (billId, amount, paymentMethod, transactionId, status) VALUES (?, ?, ?, ?, ?)',
      [billId, amount, paymentMethod, transactionId || null, 'success']
    );

    if (outstanding <= 0) {
      await req.app.locals.db.query('UPDATE meters SET relayStatus = ? WHERE id = ?', ['ON', bill.meterId]);
      await req.app.locals.db.query(
        'INSERT INTO relay_logs (meterId, relayStatus, reason) VALUES (?, ?, ?)',
        [bill.meterId, 'ON', 'Outstanding Cleared - Payment Received']
      );
    }

    res.json({
      success: true,
      message: 'Payment successful.',
      data: { paidAmount, outstanding, status, relayStatus: outstanding <= 0 ? 'ON' : 'OFF' }
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/bill/:billId', async (req, res) => {
  try {
    const [payments] = await req.app.locals.db.query('SELECT * FROM payments WHERE billId = ? ORDER BY createdAt DESC', [req.params.billId]);
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/update-relay', async (req, res) => {
  try {
    const { meterId, outstanding } = req.body;
    if (!meterId || outstanding === undefined) return res.status(422).json({ success: false, message: 'meterId and outstanding are required.' });

    let relay = 'ON';
    const today = new Date().getDate();
    if (Number(outstanding) > 0 && today > 7) relay = 'OFF';

    await req.app.locals.db.query('UPDATE meters SET relayStatus = ? WHERE id = ?', [relay, meterId]);
    await req.app.locals.db.query(
      'INSERT INTO relay_logs (meterId, relayStatus, reason) VALUES (?, ?, ?)',
      [meterId, relay, Number(outstanding) <= 0 ? 'Outstanding Cleared' : 'Outstanding Pending']
    );

    res.json({ success: true, relayStatus: relay });
  } catch (error) {
    console.error('Update relay error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/relay-logs/:meterId', async (req, res) => {
  try {
    const [logs] = await req.app.locals.db.query('SELECT * FROM relay_logs WHERE meterId = ? ORDER BY createdAt DESC LIMIT 50', [req.params.meterId]);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Get relay logs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/sync-meter', async (req, res) => {
  try {
    const { meterNumber, balance, remainingUnits, relayStatus } = req.body;
    
    if (!meterNumber) {
      return res.status(422).json({ success: false, message: 'meterNumber is required.' });
    }

    const [meters] = await req.app.locals.db.query('SELECT id FROM meters WHERE meterNumber = ?', [meterNumber]);
    if (meters.length === 0) {
      return res.status(404).json({ success: false, message: 'Meter not found in database.' });
    }

    const meterId = meters[0].id;
    
    await req.app.locals.db.query(
      'UPDATE meters SET balance = ?, remainingUnits = ?, relayStatus = ?, lastTrip = NOW() WHERE id = ?',
      [balance || 0, remainingUnits || 0, relayStatus || 'ON', meterId]
    );

    res.json({ success: true, message: 'Meter data synced successfully.' });
  } catch (error) {
    console.error('Meter sync error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
