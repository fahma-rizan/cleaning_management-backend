const router = require('express').Router();
const ctrl   = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const MANAGER = ['Super Admin', 'Main Admin'];

router.get('/bookings',          authenticate, requireRole(...MANAGER), ctrl.getBookings);
router.get('/payments',          authenticate, requireRole(...MANAGER), ctrl.getPayments);
router.get('/staff-performance', authenticate, requireRole(...MANAGER), ctrl.getStaffPerformance);
router.get('/customers',         authenticate, requireRole(...MANAGER), ctrl.getCustomers);

module.exports = router;