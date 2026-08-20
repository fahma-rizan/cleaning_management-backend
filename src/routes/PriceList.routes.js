const express = require('express');
const PriceList = require('../models/PriceList');
const router = express.Router();

// GET /api/pricelists — get all price lists
router.get('/', async (req, res) => {
  try {
    const priceLists = await PriceList.find();
    res.json({ success: true, priceLists });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pricelists/:serviceId — get price list for a specific service
router.get('/:serviceId', async (req, res) => {
  try {
    const priceList = await PriceList.findOne({ serviceId: Number(req.params.serviceId) });
    if (!priceList) {
      return res.status(404).json({ success: false, message: 'Price list not found.' });
    }
    res.json({ success: true, priceList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;