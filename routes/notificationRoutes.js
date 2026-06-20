const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/notifications/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM notifications WHERE userId=? ORDER BY id DESC`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = router;
