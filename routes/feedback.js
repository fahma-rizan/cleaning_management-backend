const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const ctrl    = require('../controllers/feedbackController');

// @route   POST /api/feedback
// @desc    Customer submits feedback or a complaint about a completed booking
// @access  Private
router.post('/', auth, ctrl.submitFeedback);

// @route   GET /api/feedback
// @desc    Get all feedback/complaints (admin), optionally filtered by ?type=&status=
// @access  Private (admin)
router.get('/', auth, ctrl.getAllFeedback);

// @route   POST /api/feedback/:id/respond
// @desc    Admin responds to a feedback/complaint entry
// @access  Private (admin)
router.post('/:id/respond', auth, ctrl.respondToFeedback);

// @route   PUT /api/feedback/:id/status
// @desc    Admin updates just the status
// @access  Private (admin)
router.put('/:id/status', auth, ctrl.updateFeedbackStatus);

module.exports = router;
