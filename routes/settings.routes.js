const router = require('express').Router();
const ctrl   = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const MANAGER = ['Super Admin', 'Main Admin'];

router.get('/public/business',       ctrl.getPublicBusinessInfo);

router.get('/',                      authenticate, requireRole(...MANAGER), ctrl.get);
router.put('/general',               authenticate, requireRole(...MANAGER), ctrl.saveGeneral);
router.put('/business',              authenticate, requireRole(...MANAGER), ctrl.saveBusiness);
router.put('/pricing/:serviceId',    authenticate, requireRole(...MANAGER), ctrl.savePricing);
router.post('/pricing',              authenticate, requireRole(...MANAGER), ctrl.createService);
router.delete('/pricing/:serviceId', authenticate, requireRole(...MANAGER), ctrl.deleteService);

module.exports = router;