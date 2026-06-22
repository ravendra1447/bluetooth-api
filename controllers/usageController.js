const db = require('../config/db');

exports.getDailyUsage = async (req, res) => {
  try {
    const { meterId } = req.params;
    
    // Join with electricity_meters to match the meter_number string (e.g. SWB260514510001)
    const [data] = await db.query(
      `SELECT d.reading_date as date, d.total_reading as totalReading, d.daily_consumption as dailyConsumption 
       FROM daily_readings d
       JOIN meters m ON d.meter_id = m.id
       WHERE m.meterNo = ? 
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
       JOIN meters m ON d.meter_id = m.id
       WHERE m.meterNo = ? AND d.reading_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) 
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
    const [meter] = await db.query(`SELECT * FROM meters WHERE meterNo = ?`, [meterId]);
    
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
    const [meters] = await db.query(`SELECT * FROM meters WHERE status='active'`);

    for (const meter of meters) {
      const endReading = meter.last_reading || 0;
      const startReading = meter.month_start_reading || 0;
      const consumption = endReading - startReading;
      const [tariffRow] = await db.query('SELECT rate FROM tariffs WHERE meterNo = ?', [meter.meterNo]);
      const tariff = (tariffRow.length > 0 ? tariffRow[0].rate : 8) || 8;
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
        `UPDATE meters SET month_start_reading = ?, monthly_consumption = 0, outstanding = ? WHERE id = ?`,
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

/**
 * Sync Live Reading from Meter to Database
 * POST /api/usage/sync-reading
 */
exports.syncReading = async (req, res) => {
  try {
    const { meterId, reading } = req.body;
    
    if (!meterId || reading == null) {
      return res.status(400).json({ success: false, message: 'Meter ID and reading are required' });
    }

    const [meters] = await db.query('SELECT * FROM meters WHERE meterNo = ?', [meterId]);
    if (meters.length === 0) {
      return res.status(404).json({ success: false, message: 'Meter not found' });
    }

    const meter = meters[0];
    const meterDbId = meter.id;
    const currentReading = parseFloat(reading);
    const today = new Date().toISOString().split('T')[0];

    // Get previous reading to calculate exact consumption since last sync
    const lastReading = parseFloat(meter.last_reading || 0);
    let consumptionSinceLastSync = 0;
    if (currentReading >= lastReading && lastReading > 0) {
      consumptionSinceLastSync = currentReading - lastReading;
    }

    // Get Tariff
    const [tariffs] = await db.query('SELECT rate FROM tariffs WHERE meterNo = ? ORDER BY effectiveFrom DESC LIMIT 1', [meterId]);
    const rate = tariffs.length > 0 ? parseFloat(tariffs[0].rate) : 5.0; // Default rate

    // If there is consumption, update the prepaid balance and outstanding
    if (consumptionSinceLastSync > 0) {
      const cost = consumptionSinceLastSync * rate;
      const newBalance = parseFloat(meter.current_balance || 0) - cost;
      const newOutstanding = parseFloat(meter.outstanding || 0) + cost;

      await db.query(
        'UPDATE meters SET current_balance = ?, outstanding = ?, last_reading = ? WHERE id = ?',
        [newBalance, newOutstanding, currentReading, meterDbId]
      );
    } else {
      await db.query('UPDATE meters SET last_reading = ? WHERE id = ?', [currentReading, meterDbId]);
    }

    // Manage daily_readings
    const [dailyReadings] = await db.query(
      'SELECT * FROM daily_readings WHERE meter_id = ? AND reading_date = ?',
      [meterDbId, today]
    );

    if (dailyReadings.length > 0) {
      // Update existing daily reading
      const dailyRecord = dailyReadings[0];
      const startOfDayReading = parseFloat(dailyRecord.total_reading) - parseFloat(dailyRecord.daily_consumption);
      let newDailyConsumption = currentReading - startOfDayReading;
      if (newDailyConsumption < 0) newDailyConsumption = 0;

      await db.query(
        'UPDATE daily_readings SET total_reading = ?, daily_consumption = ? WHERE id = ?',
        [currentReading, newDailyConsumption, dailyRecord.id]
      );
    } else {
      // Insert new daily reading
      await db.query(
        'INSERT INTO daily_readings (meter_id, reading_date, total_reading, daily_consumption) VALUES (?, ?, ?, ?)',
        [meterDbId, today, currentReading, consumptionSinceLastSync]
      );
    }

    return res.json({ success: true, message: 'Reading synced successfully' });
  } catch (err) {
    console.error('Error syncing reading:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
