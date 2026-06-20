const db = require('../config/db');

exports.getTenantDashboard = async (req, res) => {
    try {
        const tenantId = req.params.id;
        
        // Fetch Tenant Info and Property
        const [userRows] = await db.query(
            `SELECT u.name, p.propertyName, p.address 
             FROM users u 
             LEFT JOIN properties p ON u.id = (SELECT tenantId FROM properties WHERE tenantId = ? LIMIT 1)
             WHERE u.id = ?`, [tenantId, tenantId]
        );
        
        // Fetch Meter Info
        const [meterRows] = await db.query(
            `SELECT balance, tariff, relayStatus, lastTrip 
             FROM meters WHERE tenantId = ? LIMIT 1`, [tenantId]
        );

        // Fetch Latest Bill Info
        let bill = null;
        if (meterRows.length > 0) {
            const [billRows] = await db.query(
                `SELECT amount, dueDate, status 
                 FROM bills 
                 WHERE meterId = (SELECT id FROM meters WHERE tenantId = ? LIMIT 1) 
                 ORDER BY id DESC LIMIT 1`, [tenantId]
            );
            bill = billRows[0] || null;
        }

        // Mock Usage for now, later calculate from daily_usage table
        const thisMonthUsage = 65.4; 
        const totalAllowance = 100.0;

        const tenantInfo = userRows[0] || { name: 'Unknown', propertyName: 'No Property', address: '' };
        const meterInfo = meterRows[0] || { balance: 0.0, tariff: 0.0, relayStatus: 'OFF', lastTrip: 'Never' };

        res.json({
            success: true,
            data: {
                user: {
                    name: tenantInfo.name,
                    property: tenantInfo.propertyName ? \`\${tenantInfo.propertyName} - \${tenantInfo.address}\` : 'No Property assigned'
                },
                balance: meterInfo.balance,
                unitsRemaining: (meterInfo.balance / (meterInfo.tariff || 1)).toFixed(2),
                tariff: meterInfo.tariff,
                usage: {
                    used: thisMonthUsage,
                    total: totalAllowance,
                    percentage: (thisMonthUsage / totalAllowance) * 100
                },
                billing: bill ? {
                    month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
                    amount: bill.amount,
                    dueDate: bill.dueDate,
                    status: bill.status
                } : null,
                relay: {
                    status: meterInfo.relayStatus,
                    lastTrip: meterInfo.lastTrip || 'Never'
                }
            }
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

exports.getOwnerDashboard = async (req, res) => {
    // Implementation for owner
    res.json({ success: true, data: {} });
};

exports.getMasterDashboard = async (req, res) => {
    // Implementation for master
    res.json({ success: true, data: {} });
};
