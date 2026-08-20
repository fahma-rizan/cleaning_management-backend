const router = require('express').Router();
const ctrl   = require('../controllers/complaint.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];
const SENIOR  = ['Super Admin', 'Main Admin'];

router.get('/',              authenticate, requireRole(...ALLOWED), ctrl.getAll);
router.get('/:id',           authenticate, requireRole(...ALLOWED), ctrl.getById);
router.put('/:id/status',    authenticate, requireRole(...ALLOWED), ctrl.updateStatus);
router.put('/:id/priority',  authenticate, requireRole(...ALLOWED), ctrl.updatePriority);
router.put('/:id/assign',    authenticate, requireRole(...SENIOR),  ctrl.assign);
router.post('/:id/notes',    authenticate, requireRole(...ALLOWED), ctrl.addNote);

module.exports = router;