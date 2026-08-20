const router = require('express').Router();
const ctrl   = require('../controllers/review.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];

router.post('/',            authenticate, ctrl.create);
router.get('/public/stats',  ctrl.getPublicStats);
router.get('/public',        ctrl.getPublicReviews);

router.get('/stats',      authenticate, requireRole(...ALLOWED), ctrl.getStats);
router.get('/',           authenticate, requireRole(...ALLOWED), ctrl.getAll);
router.put('/:id/approve',authenticate, requireRole(...ALLOWED), ctrl.approve);
router.put('/:id/hide',   authenticate, requireRole(...ALLOWED), ctrl.hide);
router.delete('/:id',     authenticate, requireRole(...ALLOWED), ctrl.remove);

module.exports = router;