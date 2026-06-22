const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all tenants for an owner
router.get('/tenant/owner/:ownerId', async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const [tenants] = await db.query(
            `SELECT u.id, u.name, u.mobile, p.name as property_name, pt.move_in_date as move_in, pt.status,
             COALESCE(SUM(b.amount), 0) as pending_bill
             FROM users u
             JOIN property_tenants pt ON u.id = pt.tenant_id
             JOIN properties p ON pt.property_id = p.id
             LEFT JOIN meters m ON p.id = m.property_id
             LEFT JOIN bills b ON m.id = b.meter_id AND b.status = 'pending'
             WHERE p.owner_id = ? AND u.role = 'tenant'
             GROUP BY u.id, u.name, u.mobile, p.name, pt.move_in_date, pt.status`,
            [ownerId]
        );
        res.json({ success: true, data: tenants });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = router;
