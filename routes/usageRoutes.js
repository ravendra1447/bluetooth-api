const express = require('express');
const router = express.Router();
const usage = require('../controllers/usageController');

router.get('/usage/daily/:meterId', usage.dailyUsage);
router.get('/usage/hourly/:meterId', usage.hourlyUsage);

module.exports = router;
