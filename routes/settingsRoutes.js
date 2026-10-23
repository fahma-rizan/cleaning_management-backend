const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  getSettings, getPublicBusinessInfo, saveGeneral, saveBusiness,
  savePricing, createService, deleteService,
} = require('../controllers/settingsController');

const MANAGER = ['Super Admin', 'Main Admin'];

// Public — no auth, must stay above any protected '/' or param routes.
router.get('/public/business',      getPublicBusinessInfo);

router.get('/',                     protect, requireRole(...MANAGER), getSettings);
router.put('/general',              protect, requireRole(...MANAGER), saveGeneral);
router.put('/business',             protect, requireRole(...MANAGER), saveBusiness);
router.put('/pricing/:serviceId',   protect, requireRole(...MANAGER), savePricing);
router.post('/pricing',             protect, requireRole(...MANAGER), createService);
router.delete('/pricing/:serviceId',protect, requireRole(...MANAGER), deleteService);

module.exports = router;