const express = require('express');
const router = express.Router();
const bluetooth = require('../controllers/bluetoothController');

router.post('/reading', bluetooth.saveReading);

module.exports = router;
