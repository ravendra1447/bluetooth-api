const db = require('../config/db');

exports.addMeter = async (req, res) => {
    try {
        const { meterNumber, bluetoothId, propertyId, tenantId, tariff } = req.body;
        await db.query(
            `INSERT INTO meters (meterNumber, bluetoothId, propertyId, tenantId, tariff) VALUES (?, ?, ?, ?, ?)`,
            [meterNumber, bluetoothId, propertyId, tenantId, tariff]
        );
        res.json({ success: true, message: "Meter added successfully" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

exports.getMeter = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT meterNumber, currentReading, relayStatus, balance, tariff FROM meters WHERE id=?', [req.params.id]);
        res.json(rows[0] || {});
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

exports.saveReading = async (req, res) => {
    try {
        const { meterId, reading, voltage, current, frequency, relayStatus } = req.body;
        await db.query(
            `INSERT INTO meter_readings (meterId, reading, voltage, current, frequency, relayStatus) VALUES (?, ?, ?, ?, ?, ?)`,
            [meterId, reading, voltage, current, frequency, relayStatus]
        );
        
        // Update current reading in meters table
        await db.query(`UPDATE meters SET currentReading=? WHERE id=?`, [reading, meterId]);

        res.json({ success: true, message: "Reading saved successfully" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

exports.updateRelay = async (req, res) => {
    try {
        const { meterId, outstanding } = req.body;
        let relay = 'ON';

        if (outstanding > 0) {
            relay = 'ON';
        }

        const today = new Date().getDate();

        if (today > 7 && outstanding > 0) {
            relay = 'OFF';
        }

        await db.query(
            `UPDATE meters SET relayStatus=? WHERE id=?`,
            [relay, meterId]
        );

        await db.query(
            `INSERT INTO relay_logs (meterId, relayStatus, reason) VALUES (?, ?, ?)`,
            [meterId, relay, outstanding <= 0 ? 'Outstanding Cleared' : 'Outstanding Pending']
        );

        res.json({ success: true, relayStatus: relay });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};
