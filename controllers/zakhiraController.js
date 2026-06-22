const db = require('../config/db');

// ==================== HELPER FUNCTIONS ====================

const validateMeterId = (meterId) => {
    if (!meterId || meterId.trim() === '') {
        throw new Error('Meter ID is required');
    }
    return meterId.trim();
};

const validateMobile = (mobile) => {
    if (!mobile || mobile.trim() === '') {
        throw new Error('Mobile number is required');
    }
    // Indian mobile number validation
    if (!/^[0-9]{10}$/.test(mobile.trim())) {
        throw new Error('Invalid mobile number format');
    }
    return mobile.trim();
};

const handleError = (res, error, statusCode = 500) => {
    console.error('API Error:', error);
    return res.status(statusCode).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};

// ==================== METER ENDPOINTS ====================

/**
 * GET /api/v1/tenant/meters/:meterId/check
 * Check if meter is bound to active tenant
 */
exports.checkMeter = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);

        const [meters] = await db.query(`
            SELECT pt.tenant_id, pt.status as tenant_status, 
                   m.meterNo, m.customerName,
                   p.name as property_name
            FROM meters m
            LEFT JOIN property_tenants pt ON m.property_id = pt.property_id AND pt.status = 'active'
            LEFT JOIN properties p ON m.property_id = p.id
            WHERE m.meterNo = ?
        `, [meterId]);

        if (meters.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        const meter = meters[0];
        const isBound = meter.tenant_id !== null;

        return res.status(200).json({
            success: true,
            data: {
                isBound: isBound,
                userId: isBound ? meter.tenant_id : null,
                meterNumber: meter.meterNo,
                meterName: meter.customerName,
                propertyName: meter.property_name || null,
                tenantStatus: meter.tenant_status || null
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * POST /api/v1/tenant/meters/bind
 * Bind meter to tenant or register new user
 */
exports.bindMeter = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            meterId,
            name,
            mobile,
            email,
            address,
            password,
            installationDate
        } = req.body;

        // Support both camelCase and snake_case for meterType
        const meterType = req.body.meterType || req.body.meter_type || 'prepaid';

        // Validate required fields
        const validatedMeterId = validateMeterId(meterId || req.body.meter_number || req.body.meter_id);
        const validatedMobile = validateMobile(mobile);

        // Check if meter exists
        const [existingMeters] = await connection.query(
            `SELECT id, property_id FROM meters WHERE meterNo = ?`,
            [validatedMeterId]
        );

        // Check if meter is already bound to active tenant
        if (existingMeters.length > 0) {
            const [activeTenant] = await connection.query(
                `SELECT pt.tenant_id, u.name, u.mobile 
                 FROM property_tenants pt
                 JOIN users u ON pt.tenant_id = u.id
                 WHERE pt.property_id = ? AND pt.status = 'active'`,
                [existingMeters[0].property_id]
            );

            if (activeTenant.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'Meter is already bound to an active tenant',
                    data: {
                        tenantName: activeTenant[0].name,
                        tenantMobile: activeTenant[0].mobile
                    }
                });
            }
        }

        // Find or create user
        const [users] = await connection.query(
            `SELECT id, name, mobile, email FROM users WHERE mobile = ?`,
            [validatedMobile]
        );

        let userId;
        let isNewUser = false;

        const validEmail = email && email.trim() !== '' ? email.trim() : null;
        const userName = name && name.trim() !== '' ? name.trim() : 'Tenant';
        const userRole = req.body.role && req.body.role.trim() !== '' ? req.body.role.trim() : 'tenant';

        if (users.length === 0) {
            // Create new user
            const [result] = await connection.query(
                `INSERT INTO users (name, mobile, email, role) 
                 VALUES (?, ?, ?, ?)`,
                [userName, validatedMobile, validEmail, userRole]
            );

            userId = result.insertId;
            isNewUser = true;
        } else {
            userId = users[0].id;
            // Update user details if provided
            await connection.query(
                `UPDATE users SET name = ?, email = ? WHERE id = ?`,
                [userName, validEmail, userId]
            );
        }

        let propertyId;

        if (existingMeters.length === 0) {
            // Dynamically create new property and meter using the current user's ID as owner
            const propertyCode = 'P-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

            const [propertyResult] = await connection.query(
                `INSERT INTO properties (owner_id, property_code, name, address, city) 
                 VALUES (?, ?, ?, ?, 'City')`,
                [userId, propertyCode, `Property for ${validatedMeterId}`, address || 'No Address']
            );

            propertyId = propertyResult.insertId;

            await connection.query(
                `INSERT INTO meters 
                 (property_id, customerName, meterNo, meterType, current_balance, relayStatus) 
                 VALUES (?, ?, ?, ?, ?, 'on')`,
                [propertyId, 'Main Meter', validatedMeterId, meterType, 0.0]
            );
        } else {
            propertyId = existingMeters[0].property_id;
        }

        // Assign tenant to property
        const [existingTenant] = await connection.query(
            `SELECT id, status FROM property_tenants 
             WHERE property_id = ? AND tenant_id = ?`,
            [propertyId, userId]
        );

        if (existingTenant.length === 0) {
            await connection.query(
                `INSERT INTO property_tenants (property_id, tenant_id, move_in_date, status) 
                 VALUES (?, ?, CURDATE(), 'active')`,
                [propertyId, userId]
            );
        } else if (existingTenant[0].status !== 'active') {
            // Reactivate if inactive
            await connection.query(
                `UPDATE property_tenants 
                 SET status = 'active', move_in_date = CURDATE() 
                 WHERE id = ?`,
                [existingTenant[0].id]
            );
        }

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: isNewUser ? 'User registered and meter bound successfully!' : 'Meter bound successfully!',
            data: {
                userId: userId,
                propertyId: propertyId,
                meterNumber: validatedMeterId,
                isNewUser: isNewUser
            }
        });

    } catch (error) {
        await connection.rollback();
        return handleError(res, error, error.message.includes('required') || error.message.includes('Invalid') ? 400 : 500);
    } finally {
        connection.release();
    }
};

/**
 * GET /api/v1/tenant/meters/:meterId/dashboard
 * Get meter dashboard with current status
 */
exports.getDashboard = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);

        const [rows] = await db.query(`
            SELECT m.*, p.name as property_name, 
                   u.name as tenant_name, u.mobile as tenant_mobile,
                   t.rate as tariff_rate
            FROM meters m
            LEFT JOIN properties p ON m.property_id = p.id
            LEFT JOIN property_tenants pt ON p.id = pt.property_id AND pt.status = 'active'
            LEFT JOIN users u ON pt.tenant_id = u.id
            LEFT JOIN tariffs t ON m.meterNo = t.meterNo
            WHERE m.meterNo = ?
        `, [meterId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        const meter = rows[0];

        // Get today's consumption
        let todayConsumption = [{ today_units: 0 }];
        try {
            [todayConsumption] = await db.query(`
                SELECT COALESCE(SUM(units), 0) as today_units
                FROM bills 
                WHERE meter_id = ?
            `, [meter.id]);
        } catch (err) {
            console.error("Error fetching bills for today_units:", err.message);
        }

        const data = {
            meterId: meter.meterNo,
            meterName: meter.customerName,
            propertyName: meter.property_name || 'N/A',
            tenantName: meter.tenant_name || 'Not Assigned',
            tenantMobile: meter.tenant_mobile || 'N/A',
            balance: parseFloat(meter.current_balance),
            remainingUnits: parseFloat((meter.current_balance / (meter.tariff_rate || 5.0)).toFixed(2)),
            tariffPerUnit: parseFloat(meter.tariff_rate || 5.0),
            relayStatus: meter.relayStatus || 'on',
            meterType: meter.meterType || 'prepaid',
            todayConsumption: parseFloat(todayConsumption[0].today_units || 0),
            overdraftLimit: 100.00,
            overdraftActive: true,
            disconnectSchedule: 'Not Set',
            lastSync: new Date().toISOString()
        };

        // Get paginated payments
        let payments = [];
        try {
            [payments] = await db.query(`
                SELECT p.amount, p.status, p.payment_method,
                       b.amount as bill_amount, b.units, b.month, b.year
                FROM payments p 
                JOIN bills b ON p.bill_id = b.id 
                WHERE b.meter_id = ? 
                ORDER BY p.id DESC 
                LIMIT ?
            `, [meter.id, 5]);
        } catch (err) {
            console.error("Error fetching payments/bills:", err.message);
        };

        return res.status(200).json({
            success: true,
            data: data
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * GET /api/v1/tenant/meters/:meterId/consumption
 * Get consumption history
 */
exports.getConsumption = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);
        const months = parseInt(req.query.months) || 6;

        // Validate months
        if (months < 1 || months > 24) {
            return res.status(400).json({
                success: false,
                message: 'Months parameter must be between 1 and 24'
            });
        }

        // First verify meter exists and get tariff rate
        const [meterCheck] = await db.query(
            `SELECT m.id, m.current_balance, t.rate as tariff_rate 
             FROM meters m 
             LEFT JOIN tariffs t ON m.meterNo = t.meterNo 
             WHERE m.meterNo = ?`,
            [meterId]
        );

        if (meterCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        const meterId_db = meterCheck[0].id;
        const totalReading = meterCheck[0].current_balance || 0;
        const tariffRate = meterCheck[0].tariff_rate || 10.0;

        let bills = [];
        try {
            [bills] = await db.query(`
                SELECT month, year, units, amount
                FROM bills 
                WHERE meter_id = ? 
                ORDER BY year DESC, month DESC 
                LIMIT ?
            `, [meterId_db, months]);
        } catch (err) {
            console.error('Error fetching bills:', err.message);
        }

        let totalConsumption = 0;
        let totalBill = 0;
        let totalMonths = 0;

        const monthlyData = bills.map(b => {
            const units = parseFloat(b.units) || 0;
            const amount = parseFloat(b.amount) || 0;

            totalConsumption += units;
            totalBill += amount;
            totalMonths++;

            const date = new Date(b.year, b.month - 1);
            return {
                month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                kwh: units,
                bill: amount,
                date: null
            };
        });

        // Get date range
        let fromDate = null;
        let toDate = null;

        if (monthlyData.length > 0) {
            const lastDate = new Date();
            lastDate.setMonth(lastDate.getMonth() - months);
            fromDate = lastDate.toISOString().split('T')[0];
            toDate = new Date().toISOString().split('T')[0];
        }

        return res.status(200).json({
            success: true,
            data: {
                totalReading: parseFloat(totalReading.toString()),
                tariffRate: parseFloat(tariffRate.toString()),
                totalConsumption: parseFloat(totalConsumption.toFixed(2)),
                averageMonthly: totalMonths > 0 ? parseFloat((totalConsumption / totalMonths).toFixed(2)) : 0,
                totalBill: parseFloat(totalBill.toFixed(2)),
                monthlyData: monthlyData,
                period: {
                    from: fromDate,
                    to: toDate,
                    months: months
                },
                totalMonths: totalMonths
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * GET /api/v1/tenant/meters/:meterId/schedule
 * Get schedule settings
 */
exports.getSchedule = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);

        // Verify meter exists
        const [meterCheck] = await db.query(
            `SELECT id FROM meters WHERE meterNo = ?`,
            [meterId]
        );

        if (meterCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        // Get next disconnect date (7th of next month if today > 7th, else 7th of this month)
        const today = new Date();
        let nextDisconnectDate;

        if (today.getDate() > 7) {
            nextDisconnectDate = new Date(today.getFullYear(), today.getMonth() + 1, 7);
        } else {
            nextDisconnectDate = new Date(today.getFullYear(), today.getMonth(), 7);
        }

        return res.status(200).json({
            success: true,
            data: {
                disconnectDay: 7,
                disconnectDate: '7th of every month',
                disconnectTime: '11:00 AM',
                gracePeriod: 7,
                powerPreservation: true,
                autoReconnect: true,
                nextDisconnectDate: nextDisconnectDate.toISOString().split('T')[0],
                currentStatus: 'Active'
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * PUT /api/v1/tenant/meters/:meterId/schedule
 * Update schedule settings
 */
exports.updateSchedule = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);
        const { disconnectDay, disconnectTime, gracePeriod, powerPreservation, autoReconnect } = req.body;

        // Verify meter exists
        const [meterCheck] = await db.query(
            `SELECT id FROM meters WHERE meterNo = ?`,
            [meterId]
        );

        if (meterCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        // Validate inputs
        if (disconnectDay && (disconnectDay < 1 || disconnectDay > 31)) {
            return res.status(400).json({
                success: false,
                message: 'Disconnect day must be between 1 and 31'
            });
        }

        if (disconnectTime && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(disconnectTime)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid time format (HH:MM)'
            });
        }

        if (gracePeriod && (gracePeriod < 1 || gracePeriod > 30)) {
            return res.status(400).json({
                success: false,
                message: 'Grace period must be between 1 and 30 days'
            });
        }

        // Here you would save to database if you have a schedule table
        // For now, just return success

        return res.status(200).json({
            success: true,
            message: 'Schedule updated successfully',
            data: {
                updated: true,
                settings: {
                    disconnectDay: disconnectDay || 7,
                    disconnectTime: disconnectTime || '11:00',
                    gracePeriod: gracePeriod || 7,
                    powerPreservation: powerPreservation !== undefined ? powerPreservation : true,
                    autoReconnect: autoReconnect !== undefined ? autoReconnect : true
                }
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * GET /api/v1/tenant/meters/:meterId/history
 * Get transaction history
 */
exports.getHistory = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);
        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;

        // Validate pagination
        if (limit < 1 || limit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 100'
            });
        }

        if (page < 1) {
            return res.status(400).json({
                success: false,
                message: 'Page must be at least 1'
            });
        }

        const offset = (page - 1) * limit;

        // Verify meter exists
        const [meterCheck] = await db.query(
            `SELECT id FROM meters WHERE meterNo = ?`,
            [meterId]
        );

        if (meterCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        const meterId_db = meterCheck[0].id;

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total 
             FROM payments p 
             JOIN bills b ON p.bill_id = b.id 
             WHERE b.meter_id = ?`,
            [meterId_db]
        );

        const total = countResult[0].total;

        // Get paginated payments
        let payments = [];
        try {
            [payments] = await db.query(`
                SELECT p.id, p.amount, p.status, p.payment_method, p.created_at,
                       b.amount as bill_amount, b.units, b.month, b.year
                FROM payments p 
                LEFT JOIN bills b ON p.bill_id = b.id 
                WHERE b.meter_id = ?
                ORDER BY p.created_at DESC 
                LIMIT ? OFFSET ?
            `, [meterId_db, limit, offset]);
        } catch (err) {
            console.error('Error fetching payments:', err.message);
        }

        let runningBalance = 0;

        // Calculate running balance (simplified)
        const transactions = payments.map((p, index) => {
            const amount = parseFloat(p.amount) || 0;
            runningBalance += amount;

            const type = p.status === 'success' ? 'recharge' : 'failed';

            return {
                id: index + 1,
                amount: amount,
                type: type,
                status: p.status === 'success' ? 'Success' : 'Failed',
                date: new Date().toISOString(),
                balance: parseFloat(runningBalance.toFixed(2)),
                reference: `TXN-${Date.now()}-${index}`,
                paymentMethod: p.payment_method || 'N/A',
                billDetails: p.bill_amount ? {
                    amount: parseFloat(p.bill_amount) || 0,
                    units: parseFloat(p.units) || 0,
                    month: p.month,
                    year: p.year
                } : null
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                transactions: transactions,
                pagination: {
                    total: total,
                    page: page,
                    limit: limit,
                    pages: Math.ceil(total / limit)
                },
                summary: {
                    totalTransactions: transactions.length,
                    totalAmount: transactions.reduce((sum, t) => t.status === 'Success' ? sum + t.amount : sum, 0)
                }
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * GET /api/v1/tenant/meters/:meterId/events
 * Get meter events/logs
 */
exports.getEvents = async (req, res) => {
    try {
        const meterId = validateMeterId(req.params.meterId);
        const limit = parseInt(req.query.limit) || 50;

        // Verify meter exists
        const [meterCheck] = await db.query(
            `SELECT id FROM meters WHERE meterNo = ?`,
            [meterId]
        );

        if (meterCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        // Mock events - in real implementation, you'd have an events table
        const events = [
            {
                id: 1,
                type: 'connection',
                message: 'Meter connected successfully',
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                status: 'success'
            },
            {
                id: 2,
                type: 'recharge',
                message: 'Recharge of ₹500 completed',
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                status: 'success'
            },
            {
                id: 3,
                type: 'alert',
                message: 'Low balance warning (₹50 remaining)',
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                status: 'warning'
            }
        ];

        return res.status(200).json({
            success: true,
            data: {
                events: events.slice(0, limit),
                total: events.length
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * GET /api/v1/tenant/profile/:userId
 * Get user profile
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        if (isNaN(userId) || userId < 1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        const [users] = await db.query(
            `SELECT id, name, mobile, email, role, notifications_enabled 
             FROM users WHERE id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        const [metersCount] = await db.query(`
            SELECT COUNT(DISTINCT m.id) as count 
            FROM meters m 
            JOIN property_tenants pt ON m.property_id = pt.property_id 
            WHERE pt.tenant_id = ? AND pt.status = 'active'
        `, [userId]);

        const [activeMeters] = await db.query(`
            SELECT m.meterNo, m.customerName, m.current_balance, m.relayStatus,
                   p.name as property_name
            FROM meters m 
            JOIN property_tenants pt ON m.property_id = pt.property_id 
            JOIN properties p ON m.property_id = p.id
            WHERE pt.tenant_id = ? AND pt.status = 'active'
        `, [userId]);

        return res.status(200).json({
            success: true,
            data: {
                id: user.id,
                name: user.name,
                mobile: user.mobile,
                email: user.email || '',
                role: user.role,
                joinedDate: null,
                metersCount: metersCount[0].count || 0,
                activeMeters: activeMeters.map(m => ({
                    meterNumber: m.meterNo,
                    meterName: m.customerName,
                    propertyName: m.property_name,
                    balance: parseFloat(m.current_balance || 0),
                    status: m.relayStatus || 'on'
                })),
                settings: {
                    notificationsEnabled: user.notifications_enabled == 1,
                    language: 'English',
                    version: '1.0.0'
                }
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('required') ? 400 : 500);
    }
};

/**
 * POST /api/v1/tenant/profile/notifications
 * Toggle notifications
 */
exports.toggleNotifications = async (req, res) => {
    try {
        const { userId, notificationsEnabled } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        
        await db.query(
            `UPDATE users SET notifications_enabled = ? WHERE id = ?`,
            [notificationsEnabled ? 1 : 0, userId]
        );
        
        return res.json({ success: true, message: 'Notification settings updated' });
    } catch (error) {
        return handleError(res, error);
    }
};

/**
 * POST /api/v1/tenant/meters/recharge
 * Recharge meter
 */
exports.recharge = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { meterId, amount, paymentMethod, transactionId } = req.body;

        // Validate inputs
        const validatedMeterId = validateMeterId(meterId);

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount. Amount must be greater than 0'
            });
        }

        if (!paymentMethod || paymentMethod.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Payment method is required'
            });
        }

        // Check if meter exists
        const [meterRows] = await connection.query(
            `SELECT id, current_balance, meterNo FROM meters WHERE meterNo = ?`,
            [validatedMeterId]
        );

        if (meterRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        const meterId_db = meterRows[0].id;
        const currentBalance = parseFloat(meterRows[0].current_balance) || 0;

        // Update meter balance
        await connection.query(
            `UPDATE meters 
             SET current_balance = current_balance + ?, updated_at = NOW() 
             WHERE id = ?`,
            [amount, meterId_db]
        );

        // Calculate units (approximate)
        const tariffPerUnit = 5.0; // Get from meter settings
        const units = amount / tariffPerUnit;

        // Generate bill
        const [billResult] = await connection.query(
            `INSERT INTO bills (meter_id, month, year, units, amount, paid_amount, status, created_at) 
             VALUES (?, MONTH(NOW()), YEAR(NOW()), ?, ?, ?, 'paid', NOW())`,
            [meterId_db, units, amount, amount]
        );

        // Create payment record
        await connection.query(
            `INSERT INTO payments (bill_id, amount, payment_method, status, transaction_id, created_at) 
             VALUES (?, ?, ?, 'success', ?, NOW())`,
            [billResult.insertId, amount, paymentMethod, transactionId || `TXN-${Date.now()}`]
        );

        await connection.commit();

        // Get updated balance
        const [updatedMeter] = await connection.query(
            `SELECT current_balance FROM meters WHERE id = ?`,
            [meterId_db]
        );

        return res.status(200).json({
            success: true,
            message: 'Recharge completed successfully!',
            data: {
                meterId: validatedMeterId,
                amount: parseFloat(amount),
                previousBalance: currentBalance,
                newBalance: parseFloat(updatedMeter[0].current_balance),
                units: parseFloat(units.toFixed(2)),
                billId: billResult.insertId,
                paymentId: billResult.insertId,
                transactionId: transactionId || `TXN-${Date.now()}`,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        await connection.rollback();
        return handleError(res, error, error.message.includes('required') || error.message.includes('Invalid') ? 400 : 500);
    } finally {
        connection.release();
    }
};

// POST /api/meter/relay
exports.controlRelay = async (req, res) => {
    try {
        const { meterId, action } = req.body;

        if (!['on', 'off'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action'
            });
        }

        const [meter] = await db.query(
            `SELECT id FROM meters WHERE meterNo = ?`,
            [meterId]
        );

        if (meter.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Meter not found'
            });
        }

        await db.query(
            `UPDATE meters SET relayStatus = ? WHERE id = ?`,
            [action, meter[0].id]
        );

        return res.json({
            success: true,
            message: `Relay turned ${action}`
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
};