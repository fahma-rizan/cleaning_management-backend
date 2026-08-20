const express = require('express');
const { protect, authorise } = require('../middleware/auth.middleware');
const {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  getBookingStats,
} = require('../controllers/booking.controller');

const router = express.Router();

// All booking routes require login
router.use(protect);

// GET  /api/bookings/stats  (admin/staff only) — must come before /:id
router.get('/stats', authorise('admin', 'staff'), getBookingStats);

// GET  /api/bookings   — customers: own bookings; admin/staff: all
// POST /api/bookings   — create a new booking
router.route('/').get(getBookings).post(createBooking);

// GET /api/bookings/:id
router.get('/:id', getBookingById);

// PUT /api/bookings/:id/status  (admin/staff only)
router.put('/:id/status', authorise('admin', 'staff'), updateBookingStatus);

// PUT /api/bookings/:id/cancel  (customer: cancel own booking)
router.put('/:id/cancel', cancelBooking);

module.exports = router;
