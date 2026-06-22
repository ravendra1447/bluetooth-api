const db = require('../config/db');

exports.saveReading = async (req, res) => {
  try {
    const { meterId, totalReading } = req.body;

    // Fetch actual meter
    const [meter] = await db.query(
      `SELECT * FROM meters WHERE meterNo = ?`,
      [meterId]
    );

    if (meter.length === 0) {
      return res.json({ success: false, message: 'Meter not found' });
    }

    const actualMeterId = meter[0].id;
    const lastReading = meter[0].last_reading || 0;
    
    // Calculate daily consumption simply for now
    let dailyConsumption = totalReading - lastReading;
    if (dailyConsumption < 0) dailyConsumption = 0; // Prevent negative
    
    // Create the table automatically if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_readings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meter_id INT NOT NULL,
        reading_date DATE,
        total_reading DECIMAL(10,2) DEFAULT 0,
        daily_consumption DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE,
        UNIQUE KEY unique_daily_reading (meter_id, reading_date)
      )
    `);

    // Insert into daily readings or update if today's record already exists
    await db.query(
      `INSERT INTO daily_readings (meter_id, reading_date, total_reading, daily_consumption) 
       VALUES (?, CURDATE(), ?, ?) 
       ON DUPLICATE KEY UPDATE 
       total_reading = VALUES(total_reading), 
       daily_consumption = VALUES(daily_consumption)`,
      [actualMeterId, totalReading, dailyConsumption]
    );

    // Calculate monthly consumption (Sum of all daily consumptions for current month)
    const [monthlyData] = await db.query(
      `SELECT SUM(daily_consumption) as total_monthly FROM daily_readings WHERE meter_id = ? AND MONTH(reading_date) = MONTH(CURDATE()) AND YEAR(reading_date) = YEAR(CURDATE())`,
      [actualMeterId]
    );
    const monthlyUsage = monthlyData[0].total_monthly || dailyConsumption;

    // Update main meters table
    await db.query(
      `UPDATE meters SET last_reading = ? WHERE id = ?`,
      [totalReading, actualMeterId]
    );

    res.json({
      success: true,
      dailyConsumption,
      monthlyUsage,
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
