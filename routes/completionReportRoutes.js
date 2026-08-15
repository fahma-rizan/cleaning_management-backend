const express = require('express');
const router  = express.Router();
const {
  getReports, getReportByBooking, submitReport, verifyReport,
} = require('../controllers/completionReportController');

router.get('/',                    getReports);
router.get('/booking/:bookingId',  getReportByBooking);
router.post('/booking/:bookingId', submitReport);
router.post('/:id/verify',         verifyReport);

module.exports = router;
