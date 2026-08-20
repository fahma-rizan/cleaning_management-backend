const express = require('express');
const router  = express.Router();
const { optionalAuth } = require('../middleware/authMiddleware');
const { getRevenue, getServices, getPaymentMethods, getCustomers } = require('../controllers/analyticsController');

router.get('/revenue',         optionalAuth, getRevenue);
router.get('/services',        optionalAuth, getServices);
router.get('/payment-methods', optionalAuth, getPaymentMethods);
router.get('/customers',       optionalAuth, getCustomers);

module.exports = router;
