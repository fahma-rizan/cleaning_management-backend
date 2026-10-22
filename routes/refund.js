const express = require('express');
const router = express.Router();
const refundController = require('../controllers/refundController');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/authorization');

// @route   GET /api/refunds
// @desc    Get all refund requests
// @access  Private (for admin)
router.get('/', auth, adminOnly, refundController.getAllRefunds);

// @route   POST /api/refunds/request
// @desc    A customer requests a refund for an invoice
// @access  Private
router.post('/request', auth, refundController.requestRefund);

// @route   POST /api/refunds/approve/:refundId
// @desc    Admin approves a refund request
// @access  Private (for admin)
router.post('/approve/:refundId', auth, adminOnly, refundController.approveRefund);

// @route   POST /api/refunds/reject/:refundId
// @desc    Admin rejects a refund request
// @access  Private (for admin)
router.post('/reject/:refundId', auth, adminOnly, refundController.rejectRefund);
// @route   GET /api/refunds/details/:refundId
// @desc    Get full refund details for admin audit trail
// @access  Private (admin)
// A.7: Admins click into any refund entry to see complete details.
router.get('/details/:refundId', auth, adminOnly, refundController.getRefundDetails);

module.exports = router;

module.exports = router;