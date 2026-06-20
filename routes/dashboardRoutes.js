const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/tenant/dashboard/:id', dashboardController.getTenantDashboard);
router.get('/owner/dashboard/:id', dashboardController.getOwnerDashboard);
router.get('/master/dashboard', dashboardController.getMasterDashboard);

module.exports = router;
