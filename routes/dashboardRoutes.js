const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/dashboard/tenant/:id', dashboardController.getTenantDashboard);
router.get('/dashboard/owner/:id', dashboardController.getOwnerDashboard);
router.get('/dashboard/master', dashboardController.getMasterDashboard);

module.exports = router;
