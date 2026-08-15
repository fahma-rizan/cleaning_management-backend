const express = require('express');
const router  = express.Router();
const { getPriceList } = require('../controllers/pricelistController');

router.get('/:serviceId', getPriceList);

module.exports = router;
