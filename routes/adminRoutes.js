const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const { upload } = require('../middleware/upload');
const {
  getAllAdmins, getAdminById, createAdmin,
  updateAdmin, deactivateAdmin, activateAdmin, deleteAdmin,
} = require('../controllers/adminController');

const MANAGER = ['Super Admin', 'Main Admin'];

// createAdmin/updateAdmin take multipart/form-data now so the Add/Edit Admin
// forms' profile photo field actually reaches the backend — it had no
// upload middleware at all before, so any photo picked there was silently
// dropped. Uses the same Cloudinary-backed upload as staffRoutes.js.
router.get('/',               protect, requireRole(...MANAGER), getAllAdmins);
router.get('/:id',            protect, requireRole(...MANAGER), getAdminById);
router.post('/',              protect, requireRole(...MANAGER), upload.single('photo'), createAdmin);
router.put('/:id',            protect, requireRole(...MANAGER), upload.single('photo'), updateAdmin);
router.put('/:id/deactivate', protect, requireRole(...MANAGER), deactivateAdmin);
router.put('/:id/activate',   protect, requireRole(...MANAGER), activateAdmin);
router.delete('/:id',         protect, requireRole(...MANAGER), deleteAdmin);

module.exports = router;