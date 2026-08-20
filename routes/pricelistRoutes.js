const express = require('express');
const router  = express.Router();
const { getAllPriceLists, getPriceList } = require('../controllers/pricelistController');

// Must come before '/:serviceId' — otherwise a bare GET /api/pricelists
// would be swallowed by the serviceId param route instead.
router.get('/', getAllPriceLists);
router.get('/:serviceId', getPriceList);

module.exports = router;
