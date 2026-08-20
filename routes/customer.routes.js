const router = require('express').Router();
const ctrl   = require('../controllers/customer.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];

router.get('/',            authenticate, requireRole(...ALLOWED), ctrl.getAll);
router.get('/:id',         authenticate, requireRole(...ALLOWED), ctrl.getById);
router.get('/:id/details', authenticate, requireRole(...ALLOWED), ctrl.getDetails);
router.put('/:id/status',  authenticate, requireRole(...ALLOWED), ctrl.updateStatus);

module.exports = router;