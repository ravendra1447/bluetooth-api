const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');

router.get('/daily/:meterId', usageController.getDailyUsage);
router.get('/monthly/:meterId', usageController.getMonthlyUsage);
router.get('/summary/:meterId', usageController.getUsageSummary);
router.post('/freeze/monthly', usageController.monthlyFreeze);

module.exports = router;
