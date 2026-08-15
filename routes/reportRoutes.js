const express = require('express');
const router  = express.Router();
const {
  getBookingsReport, getPaymentsReport, getStaffPerformanceReport, getCustomersReport,
} = require('../controllers/reportController');

router.get('/bookings',          getBookingsReport);
router.get('/payments',          getPaymentsReport);
router.get('/staff-performance', getStaffPerformanceReport);
router.get('/customers',         getCustomersReport);

module.exports = router;
