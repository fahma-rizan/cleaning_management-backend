const express = require('express');
const router  = express.Router();
const {
  getAllReviews, getStats, approveReview, hideReview, deleteReview,
} = require('../controllers/reviewController');

// NOTE: '/stats' must be declared before any '/:id' routes to avoid being
// swallowed by the param route.
router.get('/stats',        getStats);
router.get('/',             getAllReviews);
router.put('/:id/approve',  approveReview);
router.put('/:id/hide',     hideReview);
router.delete('/:id',       deleteReview);

module.exports = router;
