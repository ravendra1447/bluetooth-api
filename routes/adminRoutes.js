const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/stats', adminController.getDashboardStats);
router.get('/properties', adminController.getProperties);
router.get('/system-logs', adminController.getSystemLogs);

module.exports = router;
