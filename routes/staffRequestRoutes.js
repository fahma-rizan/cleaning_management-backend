const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  requestUnavailability,
  endUnavailability,
  getMyPendingAvailabilityRequest,
  getAvailabilityRequests,
  approveAvailabilityRequest,
  rejectAvailabilityRequest,
  getDeclineRequests,
  approveDeclineRequest,
  rejectDeclineRequest,
  getPendingCounts,
} = require('../controllers/staffRequestController');

router.use(protect);

// ── Availability requests ───────────────────────────────────────────────────
router.post('/availability',              requestUnavailability);        // staff
router.patch('/availability/end',         endUnavailability);            // staff
router.get('/availability/mine',          getMyPendingAvailabilityRequest); // staff
router.get('/availability',               adminOnly, getAvailabilityRequests);
router.patch('/availability/:id/approve', adminOnly, approveAvailabilityRequest);
router.patch('/availability/:id/reject',  adminOnly, rejectAvailabilityRequest);

// ── Task decline requests ───────────────────────────────────────────────────
router.get('/decline',               adminOnly, getDeclineRequests);
router.patch('/decline/:id/approve', adminOnly, approveDeclineRequest);
router.patch('/decline/:id/reject',  adminOnly, rejectDeclineRequest);

// ── Sidebar badge counts ─────────────────────────────────────────────────────
router.get('/pending-counts', adminOnly, getPendingCounts);

module.exports = router;
