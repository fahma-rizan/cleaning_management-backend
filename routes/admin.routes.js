const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');
const { upload }       = require('../middleware/upload');

const MANAGER = ['Super Admin', 'Main Admin'];

router.get('/',              authenticate, requireRole(...MANAGER), ctrl.getAll);
router.get('/:id',           authenticate, requireRole(...MANAGER), ctrl.getById);
router.post('/',             authenticate, requireRole(...MANAGER), upload.single('photo'), ctrl.create);
router.put('/:id/deactivate',authenticate, requireRole(...MANAGER), ctrl.deactivate);
router.put('/:id/activate',  authenticate, requireRole(...MANAGER), ctrl.activate);
router.put('/:id',           authenticate, requireRole(...MANAGER), upload.single('photo'), ctrl.update);
router.delete('/:id',        authenticate, requireRole(...MANAGER), ctrl.remove);

module.exports = router;