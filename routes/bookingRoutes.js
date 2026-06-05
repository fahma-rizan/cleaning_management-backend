const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  createBookingSchema,
  rescheduleSchema,
  declineSchema,
  slotCheckSchema,
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
} = require('../controllers/bookingController');

router.use(protect);

router.get('/slot-check',              validate(slotCheckSchema, 'query'), checkSlotAvailability);
router.get('/my',                      getMyBookings);
router.get('/assigned',                getAssignedBookings);
router.get('/all',                     adminOnly, getAllBookings);
router.get('/needs-attention',         adminOnly, getNeedsAttention);
router.post('/',                       validate(createBookingSchema), createBooking);
router.post('/assign-unassigned',      adminOnly, assignAllUnassigned);
router.patch('/:id/reschedule',        validate(rescheduleSchema), rescheduleBooking);
router.patch('/:id/cancel',            cancelBooking);
router.patch('/:id/start',             startTask);
router.patch('/:id/complete',          completeTask);
router.patch('/:id/cash-received',     markCashReceived);
router.patch('/:id/decline',           validate(declineSchema), declineTask);
router.patch('/:id/resolve-attention', adminOnly, resolveAttention);
router.post('/:id/send-invoice',       sendInvoice);

module.exports = router;
