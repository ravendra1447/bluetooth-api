const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/bill/generate', async (req, res) => {
    try {
        const { meterId, previousReading, currentReading, tariff, previousDue, month, year, dueDate } = req.body;
        const units = currentReading - previousReading;
        const amount = units * tariff;
        const outstanding = amount + previousDue;

        await db.query(
            `INSERT INTO bills(meterId, month, year, previousReading, currentReading, units, rate, amount, previousDue, outstanding, dueDate) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [meterId, month, year, previousReading, currentReading, units, tariff, amount, previousDue, outstanding, dueDate]
        );

        res.json({ success: true, message: 'Bill generated successfully' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = router;
