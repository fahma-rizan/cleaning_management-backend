const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  getStats, getRevenueChart, getServiceBreakdown, getRecentBookings,
} = require('../controllers/overviewController');

const ALL = ['Super Admin', 'Main Admin', 'Operations Manager', 'Customer Support'];

router.get('/stats',              protect, requireRole(...ALL), getStats);
router.get('/revenue-chart',      protect, requireRole(...ALL), getRevenueChart);
router.get('/service-breakdown',  protect, requireRole(...ALL), getServiceBreakdown);
router.get('/recent-bookings',    protect, requireRole(...ALL), getRecentBookings);

module.exports = router;