const router = require('express').Router();
const ctrl   = require('../controllers/overview.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const ALL = ['Super Admin', 'Main Admin', 'Operations Manager', 'Customer Support'];

router.get('/stats',             authenticate, requireRole(...ALL), ctrl.getStats);
router.get('/revenue-chart',     authenticate, requireRole(...ALL), ctrl.getRevenueChart);
router.get('/service-breakdown', authenticate, requireRole(...ALL), ctrl.getServiceBreakdown);
router.get('/recent-bookings',   authenticate, requireRole(...ALL), ctrl.getRecentBookings);

module.exports = router;