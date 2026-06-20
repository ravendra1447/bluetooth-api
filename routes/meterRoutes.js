const express = require('express');
const router = express.Router();
const meter = require('../controllers/meterController');

router.post('/meter', meter.addMeter);
router.get('/meter/:id', meter.getMeter);
router.post('/meter/reading', meter.saveReading);
router.post('/meter/updateRelay', meter.updateRelay);

module.exports = router;
