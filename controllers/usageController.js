const db = require('../config/db');

exports.getDailyUsage = async (req, res) => {
  try {
    const { meterId } = req.params;
    
    // Join with electricity_meters to match the meter_number string (e.g. SWB260514510001)
    const [data] = await db.query(
      `SELECT d.reading_date as date, d.total_reading as totalReading, d.daily_consumption as dailyConsumption 
       FROM daily_readings d
       JOIN electricity_meters m ON d.meter_id = m.id
       WHERE m.meter_number = ? 
       ORDER BY d.reading_date DESC LIMIT 30`,
      [meterId]
    );
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

exports.getUsageSummary = async (req, res) => {
  try {
    const { meterId } = req.params;

    // Fetch daily readings for up to 30 days
    const [readings] = await db.query(
      `SELECT d.reading_date, d.daily_consumption 
       FROM daily_readings d
       JOIN electricity_meters m ON d.meter_id = m.id
       WHERE m.meter_number = ? AND d.reading_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) 
       ORDER BY d.reading_date DESC`,
      [meterId]
    );

    let today = 0, yesterday = 0, last7Days = 0, last15Days = 0, monthly = 0;
    
    // Parse today's and yesterday's date
    const dToday = new Date().toISOString().split('T')[0];
    const dYesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    readings.forEach((r) => {
      const dateStr = new Date(r.reading_date).toISOString().split('T')[0];
      const cons = parseFloat(r.daily_consumption) || 0;

      if (dateStr === dToday) today = cons;
      if (dateStr === dYesterday) yesterday = cons;

      // 7 Days
      if (new Date(r.reading_date) >= new Date(Date.now() - 7 * 86400000)) last7Days += cons;
      // 15 Days
      if (new Date(r.reading_date) >= new Date(Date.now() - 15 * 86400000)) last15Days += cons;
      // Monthly (current month)
      if (new Date(r.reading_date).getMonth() === new Date().getMonth()) monthly += cons;
    });

    res.json({
      success: true,
      data: {
        today: today.toFixed(2),
        yesterday: yesterday.toFixed(2),
        last7Days: last7Days.toFixed(2),
        last15Days: last15Days.toFixed(2),
        monthly: monthly.toFixed(2)
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

exports.getMonthlyUsage = async (req, res) => {
  try {
    const { meterId } = req.params;
    const [meter] = await db.query(`SELECT * FROM electricity_meters WHERE meter_number = ?`, [meterId]);
    
    if (meter.length === 0) return res.json({ success: false, message: 'Meter not found' });
    
    const m = meter[0];
    res.json({
      success: true,
      data: {
        month: new Date().toLocaleString('default', { month: 'long' }),
        startReading: m.month_start_reading,
        currentReading: m.last_reading,
        monthlyConsumption: m.monthly_consumption
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

exports.monthlyFreeze = async (req, res) => {
  try {
    const [meters] = await db.query(`SELECT * FROM electricity_meters WHERE status='active'`);

    for (const meter of meters) {
      const endReading = meter.last_reading || 0;
      const startReading = meter.month_start_reading || 0;
      const consumption = endReading - startReading;
      const tariff = meter.tariff_per_unit || 8;
      const bill = consumption * tariff;
      const outstanding = (meter.outstanding || 0) + bill;

      await db.query(
        `INSERT INTO monthly_freeze(meter_id, month, year, start_reading, end_reading, monthly_consumption, bill_amount, tariff, outstanding)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meter.id,
          new Date().getMonth() + 1,
          new Date().getFullYear(),
          startReading,
          endReading,
          consumption,
          bill,
          tariff,
          outstanding
        ]
      );

      await db.query(
        `UPDATE electricity_meters SET month_start_reading = ?, monthly_consumption = 0, outstanding = ? WHERE id = ?`,
        [endReading, outstanding, meter.id]
      );
    }

    if (res) {
      res.json({ success: true });
    } else {
      console.log('Cron Job: Monthly Freeze executed successfully.');
    }
  } catch (err) {
    if (res) {
      res.json({ success: false, message: err.message });
    } else {
      console.error('Cron Job Error:', err);
    }
  }
};
