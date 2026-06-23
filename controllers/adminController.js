const db = require('../config/db');

exports.getDashboardStats = async (req, res) => {
    try {
        const [tenantRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'tenant'");
        const [meterRows] = await db.query("SELECT COUNT(*) as count FROM meters");

        res.json({
            success: true,
            data: {
                activeTenants: tenantRows[0].count,
                totalMeters: meterRows[0].count
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getProperties = async (req, res) => {
    try {
        // Attempt to fetch from properties table, fallback if not fully populated
        const [rows] = await db.query("SELECT * FROM properties");
        
        // If properties table is empty or missing expected structure, return a graceful response
        res.json({
            success: true,
            data: rows
        });
    } catch (err) {
        // Fallback for UI if table doesn't exist
        res.json({
            success: true,
            data: []
        });
    }
};

exports.getSystemLogs = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 50");
        res.json({
            success: true,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
