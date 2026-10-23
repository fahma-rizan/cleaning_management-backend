const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  createReview, getPublicStats, getPublicReviews,
  getAllReviews, getStats, approveReview, hideReview, deleteReview,
} = require('../controllers/reviewController');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];

// NOTE: '/stats' and '/public/*' must be declared before any '/:id' routes
// to avoid being swallowed by the param route.
router.get('/stats',        protect, requireRole(...ALLOWED), getStats);
router.get('/public/stats', getPublicStats); // customer-facing, Approved-only
router.get('/public/list',  getPublicReviews);
router.post('/',            protect, createReview); // customer submits a review
router.get('/',             protect, requireRole(...ALLOWED), getAllReviews);
router.put('/:id/approve',  protect, requireRole(...ALLOWED), approveReview);
router.put('/:id/hide',     protect, requireRole(...ALLOWED), hideReview);
router.delete('/:id',       protect, requireRole(...ALLOWED), deleteReview);

module.exports = router;