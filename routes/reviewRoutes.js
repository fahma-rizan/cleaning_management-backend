const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createReview, getPublicStats, getPublicReviews,
  getAllReviews, getStats, approveReview, hideReview, deleteReview,
} = require('../controllers/reviewController');

// NOTE: '/stats' and '/public/*' must be declared before any '/:id' routes
// to avoid being swallowed by the param route.
router.get('/stats',        getStats);
router.get('/public/stats', getPublicStats); // customer-facing, Approved-only
router.get('/public/list',  getPublicReviews);
router.post('/',            protect, createReview); // customer submits a review
router.get('/',             getAllReviews);
router.put('/:id/approve',  approveReview);
router.put('/:id/hide',     hideReview);
router.delete('/:id',       deleteReview);

module.exports = router;
