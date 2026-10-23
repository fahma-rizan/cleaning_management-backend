const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  getActiveOffers, getAllOffers, createOffer, updateOffer, deleteOffer, validateOffer,
} = require('../controllers/offerController');

const MANAGER = ['Super Admin', 'Main Admin'];

// Public — customer-facing: browsing active offers, and validating a promo
// code at checkout. Left open, matching the rest of this file's routes.
router.get('/',            getActiveOffers);
router.post('/validate',   validateOffer);

// Admin-only — creating, editing, deleting, and listing every offer
// (active or not) for the management panel. Was fully open before, same
// gap already fixed on every other admin route in this app.
router.get('/all',         protect, requireRole(...MANAGER), getAllOffers);
router.post('/',           protect, requireRole(...MANAGER), createOffer);
router.put('/:id',         protect, requireRole(...MANAGER), updateOffer);
router.delete('/:id',      protect, requireRole(...MANAGER), deleteOffer);

module.exports = router;