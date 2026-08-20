const router = require('express').Router();
const ctrl   = require('../controllers/gps.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const ALLOWED = ['Super Admin', 'Main Admin', 'Operations Manager'];

router.get('/active-cleaners',         authenticate, requireRole(...ALLOWED), ctrl.getActiveCleaners);
router.put('/cleaners/:id/status',     authenticate,                          ctrl.updateStatus);

module.exports = router;