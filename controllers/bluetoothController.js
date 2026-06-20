const db = require('../config/db');

exports.saveReading = async (req, res) => {
  try {
    const { meterId, totalReading, voltage, current } = req.body;

    // If meterId is a number, check by id, otherwise check by meterNumber
    const [meter] = await db.query(
      `SELECT * FROM meters WHERE id = ? OR meterNumber = ?`,
      [meterId, meterId]
    );

    if (meter.length === 0) {
      return res.json({ success: false, message: 'Meter not found' });
    }

    const actualMeterId = meter[0].id;

    const m = meter[0];
    const monthlyUsage = totalReading - m.monthStartReading;
    let dailyConsumption = 0;

    const [prev] = await db.query(
      `SELECT totalReading FROM meter_readings WHERE meterId = ? ORDER BY id DESC LIMIT 1`,
      [actualMeterId]
    );

    if (prev.length > 0) {
      dailyConsumption = totalReading - prev[0].totalReading;
    }

    await db.query(
      `INSERT INTO meter_readings(meterId, readingDate, totalReading, dailyConsumption, voltage, current) VALUES(?, ?, ?, ?, ?, ?)`,
      [actualMeterId, new Date(), totalReading, dailyConsumption, voltage, current]
    );

    await db.query(
      `UPDATE meters SET currentReading = ?, monthlyUsage = ? WHERE id = ?`,
      [totalReading, monthlyUsage, actualMeterId]
    );

    res.json({
      success: true,
      dailyConsumption,
      monthlyUsage
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
