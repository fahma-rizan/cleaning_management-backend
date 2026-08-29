const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const { adminOnly } = require('../middleware/authorization');
const ctrl     = require('../controllers/priceReductionController');

// @route   POST /api/price-reductions/request
// @desc    Customer submits a price reduction request
// @access  Private
router.post('/request', auth, ctrl.requestPriceReduction);

// @route   GET /api/price-reductions
// @desc    Get all pending price reduction requests (admin)
// @access  Private
router.get('/', auth, ctrl.getAllReductions);

// @route   GET /api/price-reductions/:id
// @desc    NEW — fetch a single reduction (used by the customer-facing
//          bank-details submission page). Ownership checked in controller.
// @access  Private
router.get('/:id', auth, ctrl.getReductionById);

// @route   POST /api/price-reductions/approve/:id
// @desc    Admin approves a price reduction
// @access  Private
router.post('/approve/:id', auth, ctrl.approveReduction);

// @route   POST /api/price-reductions/reject/:id
// @desc    Admin rejects a price reduction
// @access  Private
router.post('/reject/:id', auth, ctrl.rejectReduction);

// @route   POST /api/price-reductions/:id/bank-details
// @desc    NEW — customer submits their own bank details for an approved
//          cash refund (self-service replacement for the admin manually
//          entering them). Ownership is checked inside the controller.
// @access  Private
router.post('/:id/bank-details', auth, ctrl.submitBankDetails);

// @route   POST /api/price-reductions/:id/complete-refund
// @desc    NEW — admin finalizes a cash refund once the customer's bank
//          details have been submitted.
// @access  Private (admin)
router.post('/:id/complete-refund', auth, adminOnly, ctrl.completeRefund);

module.exports = router;