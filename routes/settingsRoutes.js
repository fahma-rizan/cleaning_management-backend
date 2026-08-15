const express = require('express');
const router  = express.Router();
const {
  getSettings, saveGeneral, saveBusiness, savePricing,
} = require('../controllers/settingsController');

router.get('/',                     getSettings);
router.put('/general',              saveGeneral);
router.put('/business',             saveBusiness);
router.put('/pricing/:serviceId',   savePricing);

module.exports = router;
