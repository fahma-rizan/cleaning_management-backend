const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  createBookingSchema,
  rescheduleSchema,
  declineSchema,
  slotCheckSchema,
  cancelSchema,
} = require('../validators/bookingValidators');
const {
  createBooking,
  getMyBookings,
  getAssignedBookings,
  checkSlotAvailability,
  rescheduleBooking,
  cancelBooking,
  startTask,
  completeTask,
  markCashReceived,
  declineTask,
  getAllBookings,
  assignAllUnassigned,
  getNeedsAttention,
  resolveAttention,
  sendInvoice,
  getBookingByBookingId,
  requestReschedule,
  requestCancel,
  getCancelInfo,
  confirmCancel,
  getRescheduleInfo,
  confirmReschedule,
} = require('../controllers/bookingController');

// ── Public routes (no auth) — email-link cancel/reschedule flows and the
// PayHere checkout status poll all hit these without a token. Every other
// route below is explicitly `protect`-ed instead of using a blanket
// `router.use(protect)`, so that the public '/:bookingId' catch-all can be
// registered last without accidentally requiring auth. ─────────────────────
router.get('/cancel/:token',     getCancelInfo);
router.post('/cancel',           confirmCancel);
router.get('/reschedule/:token', getRescheduleInfo);
router.post('/reschedule',       confirmReschedule);

router.get('/slot-check',              protect, validate(slotCheckSchema, 'query'), checkSlotAvailability);
router.get('/my',                      protect, getMyBookings);
router.get('/assigned',                protect, getAssignedBookings);
router.get('/all',                     protect, adminOnly, getAllBookings);
router.get('/needs-attention',         protect, adminOnly, getNeedsAttention);
router.post('/',                       protect, validate(createBookingSchema), createBooking);
router.post('/assign-unassigned',      protect, adminOnly, assignAllUnassigned);
router.post('/:bookingId/request-reschedule', protect, requestReschedule);
router.post('/:bookingId/request-cancel',     protect, requestCancel);
router.patch('/:id/reschedule',        protect, validate(rescheduleSchema), rescheduleBooking);
router.patch('/:id/cancel',            protect, validate(cancelSchema), cancelBooking);
router.patch('/:id/start',             protect, startTask);
router.patch('/:id/complete',          protect, completeTask);
router.patch('/:id/cash-received',     protect, markCashReceived);
router.patch('/:id/decline',           protect, validate(declineSchema), declineTask);
router.patch('/:id/resolve-attention', protect, adminOnly, resolveAttention);
router.post('/:id/send-invoice',       protect, sendInvoice);

// Generic single-segment GET must be last — it would otherwise shadow
// '/my', '/assigned', '/all', etc. registered above.
router.get('/:bookingId', getBookingByBookingId);

module.exports = router;
