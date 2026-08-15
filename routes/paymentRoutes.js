const express = require('express');
const router  = express.Router();
const {
  getOverview, getInvoices, getRefunds, createRefund, approveRefund, rejectRefund,
} = require('../controllers/paymentController');

router.get('/overview',            getOverview);
router.get('/invoices',            getInvoices);
router.get('/refunds',             getRefunds);
router.post('/refunds',            createRefund);
router.put('/refunds/:id/approve', approveRefund);
router.put('/refunds/:id/reject',  rejectRefund);

module.exports = router;
