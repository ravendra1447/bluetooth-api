const express = require('express');
const router = express.Router();
const zakhiraController = require('../controllers/zakhiraController');

router.get('/check-meter/:meterId', zakhiraController.checkMeter);
router.post('/bind-meter', zakhiraController.bindMeter);
router.get('/dashboard/:meterId', zakhiraController.getDashboard);
router.get('/consumption/:meterId', zakhiraController.getConsumption);
router.get('/schedule/:meterId', zakhiraController.getSchedule);
router.post('/schedule', zakhiraController.updateSchedule);
router.get('/history/:meterId', zakhiraController.getHistory);
router.get('/events/:meterId', zakhiraController.getEvents);
router.get('/profile/:userId', zakhiraController.getProfile);
router.post('/recharge', zakhiraController.recharge);
router.post('/relay', zakhiraController.controlRelay);

module.exports = router;
