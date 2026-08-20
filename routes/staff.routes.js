const router = require('express').Router();
const ctrl   = require('../controllers/staff.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');
const { upload }       = require('../middleware/upload');

const ALL_OPS = ['Super Admin', 'Main Admin', 'Operations Manager'];
const SENIOR  = ['Super Admin', 'Main Admin'];

router.get('/available', authenticate, requireRole(...ALL_OPS), ctrl.getAvailable);
router.get('/',          authenticate, requireRole(...ALL_OPS), ctrl.getAll);
router.get('/:id',       authenticate, requireRole(...ALL_OPS), ctrl.getById);
router.post('/',         authenticate, requireRole(...SENIOR),  upload.single('photo'), ctrl.create);
router.put('/:id/deactivate', authenticate, requireRole(...SENIOR), ctrl.deactivate);
router.put('/:id/activate',   authenticate, requireRole(...SENIOR), ctrl.activate);
router.put('/:id',       authenticate, requireRole(...SENIOR),  upload.single('photo'), ctrl.update);
router.delete('/:id',    authenticate, requireRole(...SENIOR),  ctrl.remove);

module.exports = router;