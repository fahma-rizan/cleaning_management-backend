const express = require('express');
const router  = express.Router();
const {
  getStats, getRevenueChart, getServiceBreakdown, getRecentBookings,
} = require('../controllers/overviewController');

router.get('/stats',              getStats);
router.get('/revenue-chart',      getRevenueChart);
router.get('/service-breakdown',  getServiceBreakdown);
router.get('/recent-bookings',    getRecentBookings);

module.exports = router;
