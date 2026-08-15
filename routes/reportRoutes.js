const express = require('express');
const router  = express.Router();
const {
  getBookingsReport, getPaymentsReport, getStaffPerformanceReport, getCustomersReport,
  getMonthlyInventoryReport, getAnomalySummary,
} = require('../controllers/reportController');

router.get('/bookings',          getBookingsReport);
router.get('/payments',          getPaymentsReport);
router.get('/staff-performance', getStaffPerformanceReport);
router.get('/customers',         getCustomersReport);
router.get('/monthly',           getMonthlyInventoryReport);
router.get('/anomalies',         getAnomalySummary);

module.exports = router;
