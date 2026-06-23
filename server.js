const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', require('./routes/authRoutes'));
app.use('/api', require('./routes/dashboardRoutes'));
app.use('/api', require('./routes/propertyRoutes'));
app.use('/api', require('./routes/tenantRoutes'));
app.use('/api', require('./routes/meterRoutes'));
app.use('/api', require('./routes/billingRoutes'));
app.use('/api', require('./routes/paymentRoutes'));
app.use('/api', require('./routes/notificationRoutes'));
app.use('/api', require('./routes/usageRoutes'));
app.use('/api/bluetooth', require('./routes/bluetoothRoutes'));
app.use('/api/zakhira', require('./routes/zakhiraRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));

// Start Cron Jobs
require('./services/cronService');

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Server Running on port ${PORT}`);
});
