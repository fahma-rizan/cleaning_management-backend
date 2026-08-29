const express           = require('express');
const router            = express.Router();
const invoiceController = require('../controllers/invoiceController');
const auth              = require('../middleware/auth');

// IMPORTANT: Literal routes BEFORE dynamic /:param routes

// Literal GET routes
router.get('/',                        auth, invoiceController.getAllInvoices);
router.get('/reports/financial',       auth, invoiceController.getFinancialReport);
router.get('/booking/:bookingId',            invoiceController.getInvoiceByBookingId);
router.get('/user/:userId',            auth, invoiceController.getInvoicesByUserId);
// NEW — staff "Generate Invoice" balance-settlement flow (StaffInvoicePage
// pre-fill + save). See controllers/invoiceController.js.
router.get('/prefill/:bookingId',      auth, invoiceController.getInvoicePrefillData);
router.post('/balance/:bookingId',     auth, invoiceController.createBalanceInvoice);

// Literal POST routes
// REMOVED (task #16): POST /payhere and /payhere/ipn used to point at
// invoiceController's dead duplicate PayHere implementation — see the comment
// in controllers/invoiceController.js. The live checkout flow is mounted
// separately under /api/payhere (routes/payhere.js: generate-hash / notify).

// In development, allow staff to create invoices without authentication
// to make demos easier (safe only in local dev). In production the
// route remains protected by `auth`.
if (process.env.NODE_ENV === 'development') {
	router.post('/', invoiceController.createInvoice);
} else {
	router.post('/', auth, invoiceController.createInvoice);
}

// Dynamic routes (/:param — must come last)
router.post('/:id/mark-as-paid',       auth, invoiceController.markAsPaid);
router.post('/:id/approve',            auth, invoiceController.approveInvoice);
router.post('/:id/generate-payment-link', auth, invoiceController.generatePaymentLink);
// REMOVED (task #20): POST /:id/pay-balance → invoiceController.payBalance.
// Superseded by routes/payhere.js's generate-balance-hash + balance-notify —
// see the comment there.

// send-email uses invoiceNumber not _id
router.post('/:invoiceNumber/send-email', auth, invoiceController.sendInvoiceEmail);
router.put('/:invoiceNumber/status',   auth, invoiceController.updateInvoiceStatus);
router.get('/:invoiceNumber',          auth, invoiceController.getInvoiceByNumber);
router.delete('/:id',                  auth, invoiceController.deleteInvoice);

module.exports = router;
