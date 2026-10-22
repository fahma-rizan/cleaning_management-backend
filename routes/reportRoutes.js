const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getBookingsReport, getPaymentsReport, getStaffPerformanceReport, getCustomersReport,
  getMonthlyInventoryReport, getAnomalySummary, getInventoryRangeReport,
} = require('../controllers/reportController');

router.get('/bookings',          getBookingsReport);
router.get('/payments',          getPaymentsReport);
router.get('/staff-performance', getStaffPerformanceReport);
router.get('/customers',         getCustomersReport);
// Admin-only, matching the Inventory Management / Material Requests / Completion
// Reports routes — these expose internal consumption/restock business data.
router.get('/monthly',           protect, adminOnly, getMonthlyInventoryReport);
router.get('/anomalies',         getAnomalySummary);
router.get('/inventory-range',   protect, adminOnly, getInventoryRangeReport);

module.exports = router;
