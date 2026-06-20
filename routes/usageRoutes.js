const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');

router.get('/usage/daily/:meterId', usageController.getDailyUsage);
router.get('/usage/monthly/:meterId', usageController.getMonthlyUsage);
router.get('/usage/summary/:meterId', usageController.getUsageSummary);
router.post('/freeze/monthly', usageController.monthlyFreeze);

module.exports = router;
