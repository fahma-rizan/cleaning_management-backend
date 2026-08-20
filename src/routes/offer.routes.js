const express = require('express');
const { protect, authorise } = require('../middleware/auth.middleware');
const {
  getOffers,
  validateCode,
  createOffer,
  updateOffer,
  deleteOffer,
} = require('../controllers/offer.controller');

const router = express.Router();

// Public
router.get('/', getOffers);
router.post('/validate', validateCode);

// Admin only
router.post('/', protect, authorise('admin'), createOffer);
router.put('/:id', protect, authorise('admin'), updateOffer);
router.delete('/:id', protect, authorise('admin'), deleteOffer);

module.exports = router;
