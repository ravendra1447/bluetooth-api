const cron = require('node-cron');
const db = require('../config/db');

cron.schedule('0 15 * * *', async () => {
    console.log('Running cron job at 3:00 PM for outstanding check...');
    try {
        const today = new Date().getDate();
        const dueDate = 7;
        
        const [meters] = await db.query(
            `SELECT m.id, m.meterNo, m.outstanding, m.relayStatus, pt.tenant_id as tenantId
             FROM meters m 
             LEFT JOIN property_tenants pt ON m.property_id = pt.property_id AND pt.status = 'active'`
        );

        for (const meter of meters) {
            let newRelayStatus = meter.relayStatus;

            // Logic: if outstanding > 0 AND date > 7 -> OFF. If outstanding <= 0 -> ON
            if (meter.outstanding > 0 && today > dueDate) {
                newRelayStatus = 'OFF';
            } else if (meter.outstanding <= 0) {
                newRelayStatus = 'ON';
            }

            // If status changed, update DB and save logs
            if (newRelayStatus !== meter.relayStatus) {
                await db.query(`UPDATE meters SET relayStatus=? WHERE id=?`, [newRelayStatus, meter.id]);
                
                await db.query(
                    `INSERT INTO relay_logs (meter_id, relay_status, reason) VALUES (?, ?, ?)`,
                    [meter.id, newRelayStatus, newRelayStatus === 'OFF' ? 'Outstanding bill passed due date' : 'Outstanding cleared']
                );

                if (meter.tenantId) {
                    try {
                        await db.query(
                            `INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, ?)`,
                            [
                                meter.tenantId, 
                                newRelayStatus === 'OFF' ? 'Relay OFF' : 'Relay ON', 
                                newRelayStatus === 'OFF' ? 'Supply disconnected due to pending bill' : 'Supply restored', 
                                newRelayStatus === 'OFF' ? 'danger' : 'success'
                            ]
                        );
                    } catch (notifErr) {
                        console.log("Skipped notification insert (table might not exist):", notifErr.message);
                    }
                }
            }

            // Logic: warning on the 6th
            if (meter.outstanding > 0 && today === 6) {
                if (meter.tenantId) {
                    try {
                        await db.query(
                            `INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, ?)`,
                            [meter.tenantId, 'Final Warning', 'Recharge before tomorrow or power OFF', 'warning']
                        );
                    } catch (notifErr) {
                        console.log("Skipped notification insert (table might not exist):", notifErr.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error in cron job:', err);
    }
});

const usageController = require('../controllers/usageController');

// Run at 23:59 on the last day of every month
cron.schedule('59 23 * * *', async () => {
    // node-cron does not support 'L', so we run daily and check if tomorrow is the 1st
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() === 1) {
        console.log('Running monthly freeze cron job...');
        await usageController.monthlyFreeze();
    }
});
