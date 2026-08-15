const express = require('express');
const router  = express.Router();
const {
  getActiveOffers, getAllOffers, createOffer, updateOffer, deleteOffer, validateOffer,
} = require('../controllers/offerController');

// Literal paths before '/:id' wildcard
router.get('/all',        getAllOffers);
router.post('/validate',  validateOffer);
router.get('/',            getActiveOffers);
router.post('/',           createOffer);
router.put('/:id',         updateOffer);
router.delete('/:id',      deleteOffer);

module.exports = router;
