const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all properties for an owner
router.get('/property/owner/:ownerId', async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const [properties] = await db.query(
            `SELECT p.*, u.name as tenant_name, m.current_balance 
             FROM properties p
             LEFT JOIN property_tenants pt ON p.id = pt.property_id AND pt.status = 'active'
             LEFT JOIN users u ON pt.tenant_id = u.id
             LEFT JOIN meters m ON p.id = m.property_id
             WHERE p.owner_id = ?`,
            [ownerId]
        );
        res.json({ success: true, data: properties });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = router;
