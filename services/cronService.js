const cron = require('node-cron');
const db = require('../config/db');

cron.schedule('0 0 * * *', async () => {
    console.log('Running daily cron job for outstanding check...');
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

let currentDynamicState = null;

const parseTime = (timeStr) => {
    if (!timeStr) return { hour: -1, minute: -1 };
    const parts = timeStr.trim().split(' ');
    const timeParts = parts[0].split(':');
    let hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    if (parts.length > 1) {
        if (parts[1].toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (parts[1].toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    return { hour, minute };
};

// Global Schedule Cron - Checks every minute
cron.schedule('* * * * *', async () => {
    try {
        const [scheduleRows] = await db.query('SELECT * FROM global_schedule WHERE id = 1');
        if (scheduleRows.length === 0) return;
        const schedule = scheduleRows[0];
        
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];

        // Check Disconnect
        const isDisconnectDateMatch = (schedule.disconnect_date === 'Today' || schedule.disconnect_date === todayStr);
        const dTime = parseTime(schedule.disconnect_time);
        
        if (isDisconnectDateMatch && dTime.hour === currentHour && dTime.minute === currentMinute) {
            if (currentDynamicState !== "OFF") {
                console.log(`🔴 [Global Schedule] Time Matched: \${schedule.disconnect_time} -> POWER OFF`);
                await db.query(`UPDATE meters SET relayStatus='OFF'`);
                await db.query(`INSERT INTO system_logs (event_type, description) VALUES ('POWER_OFF', 'Global Schedule triggered auto cut-off for all meters at \${schedule.disconnect_time}')`);
                currentDynamicState = "OFF";
                console.log('All meters relay status set to OFF.');
            }
        }

        // Check Reconnect
        const isReconnectDateMatch = (schedule.reconnect_date === 'Today' || schedule.reconnect_date === todayStr);
        const rTime = parseTime(schedule.reconnect_time);

        if (isReconnectDateMatch && rTime.hour === currentHour && rTime.minute === currentMinute) {
            if (currentDynamicState !== "ON") {
                console.log(`🟢 [Global Schedule] Time Matched: \${schedule.reconnect_time} -> POWER ON`);
                await db.query(`UPDATE meters SET relayStatus='ON'`);
                await db.query(`INSERT INTO system_logs (event_type, description) VALUES ('POWER_ON', 'Global Schedule triggered auto allow for all meters at \${schedule.reconnect_time}')`);
                currentDynamicState = "ON";
                console.log('All meters relay status set to ON.');
            }
        }

    } catch (err) {
        console.error('Error in Global Schedule cron:', err);
    }
});
