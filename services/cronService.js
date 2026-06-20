const cron = require('node-cron');
const db = require('../config/db');

cron.schedule('0 0 * * *', async () => {
    console.log('Running daily cron job for outstanding check...');
    try {
        const today = new Date().getDate();
        
        const [meters] = await db.query(
            `SELECT m.id, m.tenantId, b.id as billId, b.outstanding, m.disconnectDate, m.preTripDays 
             FROM meters m 
             JOIN bills b ON m.id = b.meterId 
             WHERE b.status = 'pending' AND b.outstanding > 0`
        );

        for (const meter of meters) {
            const preTripDate = meter.disconnectDate - meter.preTripDays;

            if (today === preTripDate) {
                // Pre Trip Alarm
                await db.query(
                    `INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, ?)`,
                    [meter.tenantId, 'Pre Trip Alarm', 'Supply will disconnect soon due to pending bill', 'warning']
                );
            }

            if (today === meter.disconnectDate - 1) {
                // Final Warning
                await db.query(
                    `INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, ?)`,
                    [meter.tenantId, 'Final Warning', 'Supply will be disconnected tomorrow', 'danger']
                );
            }

            if (today >= meter.disconnectDate) {
                // Relay OFF
                await db.query(`UPDATE meters SET relayStatus='OFF' WHERE id=?`, [meter.id]);
                await db.query(
                    `INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, ?)`,
                    [meter.tenantId, 'Relay OFF', 'Supply disconnected due to pending bill', 'danger']
                );
                await db.query(
                    `INSERT INTO relay_logs (meterId, relayStatus, reason) VALUES (?, ?, ?)`,
                    [meter.id, 'OFF', 'Outstanding > 0 on disconnect date']
                );
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
