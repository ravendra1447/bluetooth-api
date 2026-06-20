const db = require('../config/db');

// Check Meter
exports.checkMeter = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [meters] = await db.query(`SELECT tenantId FROM meters WHERE meterNumber=?`, [meterId]);
        
        if (meters.length > 0 && meters[0].tenantId != null) {
            res.json({ success: true, isBound: true, userId: meters[0].tenantId });
        } else {
            res.json({ success: true, isBound: false });
        }
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Bind Meter or Connect
exports.bindMeter = async (req, res) => {
    try {
        const { meterId, name, mobile, email, address, meterType, installationDate } = req.body;
        
        // Ensure user exists
        const [users] = await db.query(`SELECT id FROM users WHERE phone=?`, [mobile]);
        let userId;
        if (users.length === 0) {
            const [result] = await db.query(
                `INSERT INTO users (name, phone, email, password, role) VALUES (?, ?, ?, ?, 'tenant')`,
                [name, mobile, email, 'password123']
            );
            userId = result.insertId;
        } else {
            userId = users[0].id;
        }

        // Register meter to user
        const [meters] = await db.query(`SELECT id FROM meters WHERE meterNumber=?`, [meterId]);
        if (meters.length === 0) {
            await db.query(
                `INSERT INTO meters (meterNumber, tenantId, tariff, balance) VALUES (?, ?, ?, ?)`,
                [meterId, userId, 5.0, 0.0]
            );
        } else {
            await db.query(`UPDATE meters SET tenantId=? WHERE meterNumber=?`, [userId, meterId]);
        }

        res.json({ success: true, message: "Meter Binded Successfully!" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Get Zakhira Dashboard
exports.getDashboard = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [rows] = await db.query(`SELECT * FROM meters WHERE meterNumber=?`, [meterId]);
        if (rows.length === 0) return res.json({ success: false, message: "Meter not found" });

        const meter = rows[0];
        
        const data = {
            meterId: meter.meterNumber,
            balance: meter.balance,
            remainingUnits: meter.balance / (meter.tariff || 1),
            relayStatus: meter.relayStatus,
            overdraftLimit: 100.00, // Not in DB yet
            overdraftActive: true,
            disconnectSchedule: \`0\${meter.disconnectDate} of Month\`,
            lastSync: new Date().toLocaleString()
        };

        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Consumption
exports.getConsumption = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [bills] = await db.query(
            \`SELECT month, year, units, amount 
             FROM bills 
             WHERE meterId=(SELECT id FROM meters WHERE meterNumber=?) 
             ORDER BY year DESC, month DESC LIMIT 6\`,
            [meterId]
        );

        let totalConsumption = 0;
        let totalBill = 0;
        const monthlyData = bills.map(b => {
            totalConsumption += Number(b.units);
            totalBill += Number(b.amount);
            const date = new Date(b.year, b.month - 1);
            return {
                month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                kwh: Number(b.units),
                bill: Number(b.amount)
            };
        });

        res.json({
            success: true,
            data: {
                totalConsumption,
                averageMonth: monthlyData.length ? totalConsumption / monthlyData.length : 0,
                totalBill,
                monthlyData
            }
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Schedule
exports.getSchedule = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [rows] = await db.query(`SELECT disconnectDate FROM meters WHERE meterNumber=?`, [meterId]);
        if (rows.length === 0) return res.json({ success: false, message: "Meter not found" });

        res.json({
            success: true,
            data: {
                disconnectDate: \`\${rows[0].disconnectDate} of every month\`,
                disconnectTime: '11:00 AM',
                gracePeriod: 7,
                powerPreservation: true,
                autoReconnect: true
            }
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

exports.updateSchedule = async (req, res) => {
    res.json({ success: true, message: "Schedule updated" });
};

// History
exports.getHistory = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [payments] = await db.query(
            \`SELECT p.amount, p.status, p.createdAt 
             FROM payments p 
             JOIN bills b ON p.billId = b.id 
             WHERE b.meterId = (SELECT id FROM meters WHERE meterNumber=?) 
             ORDER BY p.id DESC LIMIT 20\`,
            [meterId]
        );

        const data = payments.map(p => ({
            amount: p.amount,
            status: p.status === 'success' ? 'Success' : 'Failed',
            date: new Date(p.createdAt).toLocaleString(),
            balance: 0 // Mock balance for history
        }));

        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Events
exports.getEvents = async (req, res) => {
    try {
        const meterId = req.params.meterId;
        const [logs] = await db.query(
            \`SELECT relayStatus, reason, createdAt 
             FROM relay_logs 
             WHERE meterId=(SELECT id FROM meters WHERE meterNumber=?) 
             ORDER BY id DESC LIMIT 20\`,
            [meterId]
        );

        const data = logs.map(l => ({
            type: l.relayStatus === 'ON' ? 'Connect' : 'Disconnect',
            title: \`Meter \${l.relayStatus === 'ON' ? 'Connected' : 'Disconnected'} \${l.reason ? '- '+l.reason : ''}\`,
            date: new Date(l.createdAt).toLocaleString()
        }));

        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.userId;
        const [users] = await db.query(\`SELECT name, phone FROM users WHERE id=?\`, [userId]);
        const [metersCount] = await db.query(\`SELECT COUNT(*) as count FROM meters WHERE tenantId=?\`, [userId]);

        if (users.length === 0) return res.json({ success: false, message: "User not found" });

        res.json({
            success: true,
            data: {
                name: users[0].name,
                mobile: users[0].phone,
                metersCount: metersCount[0].count,
                notificationsEnabled: true,
                language: 'English',
                version: '1.0.0'
            }
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

// Recharge
exports.recharge = async (req, res) => {
    try {
        const { meterId, amount, paymentMethod } = req.body;
        await db.query(\`UPDATE meters SET balance = balance + ? WHERE meterNumber = ?\`, [amount, meterId]);
        
        // Insert dummy bill and payment for history
        const [meterRows] = await db.query(\`SELECT id FROM meters WHERE meterNumber=?\`, [meterId]);
        if (meterRows.length > 0) {
            const mId = meterRows[0].id;
            const [bill] = await db.query(\`INSERT INTO bills (meterId, amount, paidAmount, status) VALUES (?, ?, ?, 'paid')\`, [mId, amount, amount]);
            await db.query(\`INSERT INTO payments (billId, amount, paymentMethod, status) VALUES (?, ?, ?, 'success')\`, [bill.insertId, amount, paymentMethod]);
        }
        
        res.json({ success: true, message: "Recharge Successful" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};
