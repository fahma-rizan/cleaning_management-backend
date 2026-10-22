const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getReports, getReportByBooking, getAllocationForBooking, submitReport, verifyReport,
} = require('../controllers/completionReportController');

// Admin-only: browsing/verifying reports. Completion reports (and the staff
// personal details they surface) are strictly admin-viewable — staff cannot
// view any report, their own or anyone else's.
router.get('/',                   protect, adminOnly, getReports);
router.get('/booking/:bookingId', protect, adminOnly, getReportByBooking);
router.post('/:id/verify',        protect, adminOnly, verifyReport);

// Staff-accessible: submitting their own booking's report. protect only —
// the controller itself checks the requester is actually assigned to the
// booking (or is an admin) before returning/accepting anything.
router.get('/booking/:bookingId/allocation', protect, getAllocationForBooking);
router.post('/booking/:bookingId',           protect, submitReport);

module.exports = router;
