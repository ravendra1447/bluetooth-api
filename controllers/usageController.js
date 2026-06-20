const db = require('../config/db');

exports.dailyUsage = async (req, res) => {
  try {
    const meterId = req.params.meterId;
    const [rows] = await db.query(
      `SELECT DATE(createdAt) as day, MAX(totalReading) as totalReading
       FROM meter_readings 
       WHERE meterId = ? AND MONTH(createdAt) = MONTH(CURDATE()) AND YEAR(createdAt) = YEAR(CURDATE())
       GROUP BY DATE(createdAt)
       ORDER BY day ASC`,
      [meterId]
    );

    let result = [];
    for (let i = 0; i < rows.length; i++) {
      let consumption = 0;
      if (i > 0) {
        consumption = rows[i].totalReading - rows[i - 1].totalReading;
      }
      result.push({
        date: rows[i].day,
        totalReading: rows[i].totalReading,
        dailyConsumption: consumption
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

exports.hourlyUsage = async (req, res) => {
  try {
    const meterId = req.params.meterId;
    // Get readings for the current day, grouped by hour
    const [rows] = await db.query(
      `SELECT HOUR(createdAt) as hour, MAX(totalReading) as totalReading
       FROM meter_readings 
       WHERE meterId = ? AND DATE(createdAt) = CURDATE()
       GROUP BY HOUR(createdAt)
       ORDER BY hour ASC`,
      [meterId]
    );

    let result = [];
    for (let i = 0; i < rows.length; i++) {
      let consumption = 0;
      if (i > 0) {
        consumption = rows[i].totalReading - rows[i - 1].totalReading;
      }
      result.push({
        hour: rows[i].hour,
        totalReading: rows[i].totalReading,
        hourlyConsumption: consumption,
        isPeakHour: rows[i].hour >= 18 && rows[i].hour <= 22 // 6 PM to 10 PM
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
