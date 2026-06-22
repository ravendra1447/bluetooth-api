const db = require('../config/db');

// ==================== HELPER FUNCTIONS ====================

const handleError = (res, error, statusCode = 500) => {
    console.error('API Error:', error);
    return res.status(statusCode).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};

const validateId = (id) => {
    const parsedId = parseInt(id);
    if (isNaN(parsedId) || parsedId < 1) {
        throw new Error('Invalid ID provided');
    }
    return parsedId;
};

/**
 * GET /api/v1/tenant/dashboard/:id
 * Get tenant dashboard with all relevant information
 */
exports.getTenantDashboard = async (req, res) => {
    try {
        const tenantId = validateId(req.params.id);

        // Fetch Tenant Info and Property
        const [userRows] = await db.query(
            `SELECT u.id, u.name, u.mobile, u.email,
                    p.id as propertyId, p.name as propertyName, p.address, p.city,
                    pt.move_in_date, pt.status as tenantStatus
             FROM users u 
             LEFT JOIN property_tenants pt ON u.id = pt.tenant_id AND pt.status = 'active'
             LEFT JOIN properties p ON pt.property_id = p.id
             WHERE u.id = ? AND u.role = 'tenant'`,
            [tenantId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        const tenantInfo = userRows[0];

        // Fetch Meter Info
        const [meterRows] = await db.query(
            `SELECT m.id as meterId, m.meterNo, m.customerName, 
                    m.current_balance as balance, m.relay_status, m.meter_type, m.status,
                    p.id as propertyId, p.name as propertyName,
                    pt.tenant_id, u.name as tenantName
             FROM meters m 
             JOIN property_tenants pt ON m.property_id = pt.property_id
             WHERE pt.tenant_id = ? AND pt.status = 'active'
             LIMIT 1`,
            [tenantId]
        );

        let meterInfo = null;
        let bill = null;
        let usageData = {
            used: 0,
            total: 100,
            percentage: 0
        };

        if (meterRows.length > 0) {
            meterInfo = meterRows[0];

            // Fetch Latest Bill
            const [billRows] = await db.query(
                `SELECT id, amount, units, month, year, 
                        due_date as dueDate, status, created_at
                 FROM bills 
                 WHERE meter_id = ?
                 ORDER BY year DESC, month DESC, id DESC 
                 LIMIT 1`,
                [meterInfo.meterId]
            );
            bill = billRows[0] || null;

            // Calculate current month usage
            const [usageRows] = await db.query(
                `SELECT COALESCE(SUM(units), 0) as totalUnits,
                        COALESCE(SUM(amount), 0) as totalAmount
                 FROM bills 
                 WHERE meter_id = ? 
                 AND month = MONTH(CURDATE()) 
                 AND year = YEAR(CURDATE())`,
                [meterInfo.meterId]
            );

            if (usageRows.length > 0) {
                usageData.used = parseFloat(usageRows[0].totalUnits) || 0;
                // Get monthly allowance from settings or calculate based on previous months
                const [allowanceRows] = await db.query(
                    `SELECT AVG(units) as avgUnits 
                     FROM bills 
                     WHERE meter_id = ? 
                     AND created_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`,
                    [meterInfo.meterId]
                );
                usageData.total = parseFloat(allowanceRows[0]?.avgUnits || 100);
                usageData.percentage = (usageData.used / usageData.total) * 100;
            }
        }

        // Get notification count
        const [notificationCount] = await db.query(
            `SELECT COUNT(*) as count 
             FROM notifications 
             WHERE user_id = ? AND is_read = 0`,
            [tenantId]
        );

        // Prepare response
        const responseData = {
            user: {
                id: tenantInfo.id,
                name: tenantInfo.name,
                mobile: tenantInfo.mobile,
                email: tenantInfo.email || '',
                property: tenantInfo.propertyName ?
                    `${tenantInfo.propertyName} - ${tenantInfo.address}, ${tenantInfo.city || ''}` :
                    'No Property assigned',
                propertyId: tenantInfo.propertyId,
                moveInDate: tenantInfo.move_in_date,
                status: tenantInfo.tenantStatus || 'inactive'
            },
            meter: meterInfo ? {
                meterId: meterInfo.meterId,
                meterNumber: meterInfo.meterNo,
                meterName: meterInfo.customerName,
                meterType: meterInfo.meter_type || 'prepaid',
                balance: parseFloat(meterInfo.balance || 0),
                unitsRemaining: parseFloat(meterInfo.unitsRemaining || 0).toFixed(2),
                tariff: parseFloat(meterInfo.tariff || 5.0),
                relayStatus: meterInfo.relayStatus || 'on'
            } : null,
            usage: {
                currentMonth: {
                    used: parseFloat(usageData.used.toFixed(2)),
                    total: parseFloat(usageData.total.toFixed(2)),
                    percentage: parseFloat(usageData.percentage.toFixed(1)),
                    status: usageData.percentage > 90 ? 'critical' :
                        usageData.percentage > 75 ? 'warning' : 'normal'
                },
                billingCycle: `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`
            },
            billing: bill ? {
                id: bill.id,
                month: `${bill.month}/${bill.year}`,
                amount: parseFloat(bill.amount || 0),
                units: parseFloat(bill.units || 0),
                dueDate: bill.dueDate,
                status: bill.status || 'pending',
                isOverdue: bill.dueDate && new Date(bill.dueDate) < new Date() && bill.status === 'pending'
            } : null,
            relay: {
                status: meterInfo?.relayStatus || 'unknown',
                lastTrip: 'Never',
                isOnline: true
            },
            notifications: {
                unread: notificationCount[0]?.count || 0
            }
        };

        return res.status(200).json({
            success: true,
            data: responseData
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('Invalid') ? 400 : 500);
    }
};

/**
 * GET /api/v1/owner/dashboard/:id
 * Get owner dashboard with property overview
 */
exports.getOwnerDashboard = async (req, res) => {
    try {
        const ownerId = validateId(req.params.id);

        // Check if owner exists
        const [ownerCheck] = await db.query(
            `SELECT id, name FROM users WHERE id = ? AND role = 'owner'`,
            [ownerId]
        );

        if (ownerCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }

        // 1. Overview Statistics
        const [stats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM properties WHERE owner_id = ?) as totalProperties,
                (SELECT COUNT(DISTINCT pt.tenant_id) 
                 FROM property_tenants pt 
                 JOIN properties p ON pt.property_id = p.id 
                 WHERE p.owner_id = ? AND pt.status = 'active') as activeTenants,
                (SELECT COUNT(*) 
                 FROM meters m 
                 JOIN properties p ON m.property_id = p.id 
                 WHERE p.owner_id = ?) as totalMeters,
                (SELECT COALESCE(SUM(b.amount), 0) 
                 FROM bills b 
                 JOIN meters m ON b.meter_id = m.id 
                 JOIN properties p ON m.property_id = p.id 
                 WHERE p.owner_id = ? AND b.status = 'pending') as pendingAmount,
                (SELECT COALESCE(SUM(b.amount), 0) 
                 FROM bills b 
                 JOIN meters m ON b.meter_id = m.id 
                 JOIN properties p ON m.property_id = p.id 
                 WHERE p.owner_id = ? AND b.status = 'paid' 
                 AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) as monthlyCollection
        `, [ownerId, ownerId, ownerId, ownerId, ownerId]);

        // 2. Properties List with Details
        const [propertiesList] = await db.query(`
            SELECT 
                p.id,
                p.name as title,
                p.address,
                p.city,
                p.property_code,
                u.name as tenantName,
                u.mobile as tenantMobile,
                b.status,
                m.meterNo,
                m.current_balance,
                m.relay_status,
                pt.move_in_date,
                pt.status as tenantStatus,
                b.id as billId,
                b.amount as billAmount,
                b.status as billStatus,
                b.due_date as billDueDate,
                DATEDIFF(CURDATE(), b.due_date) as overdueDays
            FROM properties p 
            LEFT JOIN property_tenants pt ON p.id = pt.property_id AND pt.status = 'active'
            LEFT JOIN users u ON pt.tenant_id = u.id 
            LEFT JOIN meters m ON p.id = m.property_id
            LEFT JOIN bills b ON m.id = b.meter_id 
                AND b.status = 'pending' 
                AND b.created_at = (
                    SELECT MAX(created_at) 
                    FROM bills b2 
                    WHERE b2.meter_id = m.id AND b2.status = 'pending'
                )
            WHERE p.owner_id = ?
            ORDER BY p.id DESC
        `, [ownerId]);

        // 3. Recent Activities
        const [recentActivities] = await db.query(`
            (SELECT 'payment' as type, 
                    p.amount, 
                    p.status,
                    p.created_at as timestamp,
                    p.amount as amount,
                    m.meterNo
             FROM payments p
             JOIN bills b ON p.bill_id = b.id
             JOIN meters m ON b.meter_id = m.id
             JOIN properties pr ON m.property_id = pr.id
             JOIN users u ON pr.owner_id = u.id
             WHERE pr.owner_id = ?
             ORDER BY p.created_at DESC
             LIMIT 5)
            UNION ALL
            (SELECT 'tenant' as type,
                    NULL as amount,
                    pt.status,
                    pt.created_at as timestamp,
                    b.amount as amount,
                    NULL as meterNo
             FROM property_tenants pt
             JOIN properties pr ON pt.property_id = pr.id
             JOIN users u ON pt.tenant_id = u.id
             WHERE pr.owner_id = ?
             ORDER BY pt.created_at DESC
             LIMIT 5)
            ORDER BY timestamp DESC
            LIMIT 10
        `, [ownerId, ownerId]);

        // 4. Monthly Revenue
        const [monthlyRevenue] = await db.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COALESCE(SUM(amount), 0) as revenue
            FROM payments p
            JOIN bills b ON p.bill_id = b.id
            JOIN meters m ON b.meter_id = m.id
            JOIN properties pr ON m.property_id = pr.id
            WHERE pr.owner_id = ? 
                AND p.status = 'success'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
        `, [ownerId]);

        // Prepare property status colors
        const propertiesWithStatus = propertiesList.map(p => {
            let statusColor = 'grey';
            let statusText = 'No Tenant';

            if (p.tenantStatus === 'active') {
                if (p.billStatus === 'pending') {
                    if (p.overdueDays > 0) {
                        statusColor = 'danger';
                        statusText = 'Overdue';
                    } else {
                        statusColor = 'warning';
                        statusText = 'Pending';
                    }
                } else {
                    statusColor = 'success';
                    statusText = 'Active';
                }
            } else if (p.tenantStatus === 'inactive') {
                statusColor = 'grey';
                statusText = 'Inactive';
            }

            return {
                ...p,
                statusColor: statusColor,
                statusText: statusText,
                tenantName: p.tenantName || 'Vacant',
                billAmount: parseFloat(p.billAmount || 0),
                currentBalance: parseFloat(p.currentBalance || 0)
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                owner: {
                    id: ownerId,
                    name: ownerCheck[0].name
                },
                stats: {
                    totalProperties: parseInt(stats[0].totalProperties) || 0,
                    activeTenants: parseInt(stats[0].activeTenants) || 0,
                    totalMeters: parseInt(stats[0].totalMeters) || 0,
                    pendingAmount: parseFloat(stats[0].pendingAmount || 0),
                    monthlyCollection: parseFloat(stats[0].monthlyCollection || 0)
                },
                properties: propertiesWithStatus,
                recentActivities: recentActivities.map(activity => ({
                    type: activity.type,
                    amount: activity.amount ? parseFloat(activity.amount) : null,
                    status: activity.status,
                    timestamp: new Date(activity.timestamp).toISOString(),
                    amount: parseFloat(activity.amount),
                    meterNumber: activity.meterNo || null,
                    description: activity.type === 'payment' ?
                        `Payment of ₹${parseFloat(activity.amount || 0).toFixed(2)} by ${activity.userName}` :
                        `${activity.userName} ${activity.status === 'active' ? 'moved in' : 'moved out'}`
                })),
                monthlyRevenue: monthlyRevenue.map(m => ({
                    month: m.month,
                    revenue: parseFloat(m.revenue || 0)
                })),
                summary: {
                    occupancyRate: stats[0].totalProperties > 0 ?
                        ((stats[0].activeTenants / stats[0].totalProperties) * 100).toFixed(1) : 0,
                    collectionEfficiency: stats[0].pendingAmount > 0 ?
                        ((stats[0].monthlyCollection / (stats[0].monthlyCollection + stats[0].pendingAmount)) * 100).toFixed(1) : 100
                }
            }
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('Invalid') ? 400 : 500);
    }
};

/**
 * GET /api/v1/master/dashboard
 * Get master/admin dashboard with system-wide statistics
 */
exports.getMasterDashboard = async (req, res) => {
    try {
        // System-wide statistics
        const [stats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'tenant') as totalTenants,
                (SELECT COUNT(*) FROM users WHERE role = 'owner') as totalOwners,
                (SELECT COUNT(*) FROM users WHERE role = 'master') as totalAdmins,
                (SELECT COUNT(*) FROM properties) as totalProperties,
                (SELECT COUNT(*) FROM meters) as totalMeters,
                (SELECT COUNT(*) FROM property_tenants WHERE status = 'active') as activeTenancies,
                (SELECT COALESCE(SUM(amount), 0) FROM bills WHERE status = 'pending') as totalPendingBills,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' 
                 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) as monthlyRevenue,
                (SELECT COUNT(*) FROM bills WHERE status = 'pending' 
                 AND due_date < CURDATE()) as overdueBills
        `);

        // Recent registrations
        const [recentUsers] = await db.query(`
            SELECT id, name, mobile, role, created_at
            FROM users 
            WHERE role IN ('tenant', 'owner')
            ORDER BY created_at DESC
            LIMIT 10
        `);

        // System health metrics
        const [systemHealth] = await db.query(`
            SELECT 
                COUNT(*) as totalMeters,
                SUM(CASE WHEN relay_status = 'on' THEN 1 ELSE 0 END) as activeMeters,
                SUM(CASE WHEN relay_status = 'off' THEN 1 ELSE 0 END) as offlineMeters
            FROM meters
        `);

        // Revenue by type
        const [revenueByType] = await db.query(`
            SELECT 
                payment_method,
                COALESCE(SUM(amount), 0) as totalAmount,
                COUNT(*) as transactionCount
            FROM payments 
            WHERE status = 'success'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY payment_method
        `);

        // Top performing properties
        const [topProperties] = await db.query(`
            SELECT 
                p.name,
                p.property_code,
                COUNT(DISTINCT pt.tenant_id) as tenantCount,
                COALESCE(SUM(b.amount), 0) as totalRevenue,
                COALESCE(AVG(b.amount), 0) as avgBill
            FROM properties p
            LEFT JOIN property_tenants pt ON p.id = pt.property_id AND pt.status = 'active'
            LEFT JOIN meters m ON p.id = m.property_id
            LEFT JOIN bills b ON m.id = b.meter_id AND b.status = 'paid'
            GROUP BY p.id
            ORDER BY totalRevenue DESC
            LIMIT 5
        `);

        return res.status(200).json({
            success: true,
            data: {
                systemStats: {
                    totalUsers: stats[0].totalTenants + stats[0].totalOwners + stats[0].totalAdmins,
                    tenants: stats[0].totalTenants || 0,
                    owners: stats[0].totalOwners || 0,
                    admins: stats[0].totalAdmins || 0,
                    properties: stats[0].totalProperties || 0,
                    meters: stats[0].totalMeters || 0,
                    activeTenancies: stats[0].activeTenancies || 0,
                    totalPendingBills: parseFloat(stats[0].totalPendingBills || 0),
                    monthlyRevenue: parseFloat(stats[0].monthlyRevenue || 0),
                    overdueBills: stats[0].overdueBills || 0
                },
                systemHealth: {
                    totalMeters: systemHealth[0].totalMeters || 0,
                    activeMeters: systemHealth[0].activeMeters || 0,
                    offlineMeters: systemHealth[0].offlineMeters || 0,
                    healthScore: systemHealth[0].totalMeters > 0 ?
                        ((systemHealth[0].activeMeters / systemHealth[0].totalMeters) * 100).toFixed(1) : 0
                },
                recentUsers: recentUsers.map(user => ({
                    id: user.id,
                    name: user.name,
                    mobile: user.mobile,
                    role: user.role,
                    joinedDate: new Date(user.created_at).toISOString().split('T')[0]
                })),
                revenueByPaymentMethod: revenueByType.map(r => ({
                    method: r.payment_method || 'other',
                    total: parseFloat(r.totalAmount || 0),
                    count: r.transactionCount || 0
                })),
                topProperties: topProperties.map(p => ({
                    name: p.name,
                    code: p.property_code,
                    tenants: p.tenantCount || 0,
                    revenue: parseFloat(p.totalRevenue || 0),
                    averageBill: parseFloat(p.avgBill || 0)
                })),
                quickStats: {
                    occupancyRate: stats[0].totalProperties > 0 ?
                        ((stats[0].activeTenancies / stats[0].totalProperties) * 100).toFixed(1) : 0,
                    collectionRate: stats[0].monthlyRevenue > 0 && stats[0].totalPendingBills > 0 ?
                        ((stats[0].monthlyRevenue / (stats[0].monthlyRevenue + stats[0].totalPendingBills)) * 100).toFixed(1) : 100,
                    averageTenantsPerProperty: stats[0].totalProperties > 0 ?
                        (stats[0].activeTenancies / stats[0].totalProperties).toFixed(1) : 0
                }
            }
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ==================== ADDITIONAL DASHBOARD ENDPOINTS ====================

/**
 * GET /api/v1/tenant/dashboard/:id/bills
 * Get tenant's bill history
 */
exports.getTenantBills = async (req, res) => {
    try {
        const tenantId = validateId(req.params.id);

        const [bills] = await db.query(`
            SELECT b.id, b.amount, b.units, b.month, b.year, 
                   b.status, b.due_date, b.paid_amount, b.created_at
            FROM bills b
            JOIN meters m ON b.meter_id = m.id
            JOIN property_tenants pt ON m.property_id = pt.property_id
            WHERE pt.tenant_id = ? 
            ORDER BY b.year DESC, b.month DESC
            LIMIT 12
        `, [tenantId]);

        return res.status(200).json({
            success: true,
            data: bills.map(b => ({
                ...b,
                amount: parseFloat(b.amount || 0),
                paid_amount: parseFloat(b.paid_amount || 0),
                outstanding: parseFloat((b.amount - (b.paid_amount || 0)).toFixed(2))
            }))
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('Invalid') ? 400 : 500);
    }
};

/**
 * GET /api/v1/owner/dashboard/:id/tenants
 * Get all tenants under owner
 */
exports.getOwnerTenants = async (req, res) => {
    try {
        const ownerId = validateId(req.params.id);

        const [tenants] = await db.query(`
            SELECT DISTINCT u.id, u.name, u.mobile, u.email,
                   p.name as propertyName, pt.move_in_date, pt.status,
                   m.meterNo, m.current_balance
            FROM users u
            JOIN property_tenants pt ON u.id = pt.tenant_id
            JOIN properties p ON pt.property_id = p.id
            LEFT JOIN meters m ON p.id = m.property_id
            WHERE p.owner_id = ?
            ORDER BY pt.created_at DESC
        `, [ownerId]);

        return res.status(200).json({
            success: true,
            data: tenants.map(t => ({
                ...t,
                current_balance: parseFloat(t.current_balance || 0)
            }))
        });

    } catch (error) {
        return handleError(res, error, error.message.includes('Invalid') ? 400 : 500);
    }
};

/**
 * GET /api/v1/master/dashboard/system-logs
 * Get system logs for master
 */
exports.getSystemLogs = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;

        // Mock system logs
        const logs = [
            {
                id: 1,
                type: 'info',
                message: 'System backup completed',
                timestamp: new Date().toISOString()
            },
            {
                id: 2,
                type: 'warning',
                message: 'High memory usage detected',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            }
        ];

        return res.status(200).json({
            success: true,
            data: logs.slice(0, limit)
        });

    } catch (error) {
        return handleError(res, error);
    }
};