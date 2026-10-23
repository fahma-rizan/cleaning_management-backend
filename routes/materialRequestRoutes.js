const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getRequests, getRequestByBooking, confirmRequest,
} = require('../controllers/materialRequestController');

// Admin Inventory Management — Material Requests tab. No reject route exists:
// low stock at confirm time is a warning, never a blocker.
router.get('/',                    protect, adminOnly, getRequests);
router.get('/booking/:bookingId',  protect, adminOnly, getRequestByBooking);
router.post('/:id/confirm',        protect, adminOnly, confirmRequest);

module.exports = router;
