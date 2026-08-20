const express = require('express');
const router  = express.Router();
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const {
  createInvoice, getInvoices, getInvoiceByBooking, getInvoice,
  markAsPaid, approveInvoice, updateStatus, sendInvoiceEmail,
} = require('../controllers/invoiceController');

// Specific paths must come before the generic '/:idOrNumber' catch-all.
router.get('/booking/:bookingId', optionalAuth, getInvoiceByBooking);

router.get('/',  optionalAuth, getInvoices);
router.post('/', protect,      createInvoice);

router.post('/:id/mark-as-paid', protect, markAsPaid);
router.post('/:id/approve',      protect, approveInvoice);
router.put('/:invoiceNumber/status',     optionalAuth, updateStatus);
router.post('/:invoiceNumber/send-email', protect,     sendInvoiceEmail);

router.get('/:idOrNumber', optionalAuth, getInvoice);

module.exports = router;
