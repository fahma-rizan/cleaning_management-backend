const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const { upload } = require('../middleware/upload');
const {
  createStaff,
  toggleAvailability,
  getAllStaff,
  getMyPerformance,
  getReassignmentData,
  getMyProfile,
  updateMyProfile,
  getAllStaffV2,
  getStaffByIdV2,
  getAvailableStaffV2,
  createStaffV2,
  updateStaffV2,
  deactivateStaffV2,
  activateStaffV2,
  deleteStaffV2,
} = require('../controllers/staffController');
const { getStaffOverview, getStaffTaskDetails } = require('../controllers/staffRequestController');

// Role tiers restored from the old staff.routes.js.
const ALL_OPS = ['Super Admin', 'Main Admin', 'Operations Manager'];
const SENIOR  = ['Super Admin', 'Main Admin'];

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTANT: every literal path below (old and new) must be registered before
// the `/:id` wildcard routes near the bottom, or Express will match e.g.
// GET /api/staff/all against GET /:id (with id="all") instead.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Original protected staff routes (unchanged) ───────────────────────────────
router.post('/create',        protect, adminOnly, createStaff);       // admin
router.patch('/availability', protect, toggleAvailability);           // staff
router.get('/performance',    protect, getMyPerformance);             // staff
router.get('/all',            protect, adminOnly, getAllStaff);       // admin
router.get('/reassignments',  protect, adminOnly, getReassignmentData); // admin
router.get('/me',             protect, getMyProfile);                 // staff
router.patch('/profile',      protect, updateMyProfile);              // staff

// ─── Admin panel v2 (feature/admin-dashboard) ──────────────────────────────────
// Locked down to the same role tiers the old backend used for the equivalent
// staff CRUD endpoints, now that lib/api.ts sends a real Bearer token.
//
// Photo upload restored to Cloudinary (middleware/upload.js) — this used to
// be a plain multer().diskStorage() writing to local disk in
// backend-new/uploads/staff/, which loses every photo on redeploy. req.file
// now carries a Cloudinary secure_url instead of a local filename; see the
// matching change in controllers/staffController.js.
router.get('/available',      protect, requireRole(...ALL_OPS), getAvailableStaffV2);
router.get('/overview',       protect, adminOnly,               getStaffOverview); // Staff Task Overview — admin
router.get('/',                protect, requireRole(...ALL_OPS), getAllStaffV2);
router.post('/',               protect, requireRole(...SENIOR),  upload.single('photo'), createStaffV2);

// ─── /:id wildcard routes — must stay last ─────────────────────────────────────
router.get('/:id/tasks',       protect, adminOnly,               getStaffTaskDetails); // Staff Task Overview — detail drill-down
router.get('/:id',             protect, requireRole(...ALL_OPS), getStaffByIdV2);
router.put('/:id',             protect, requireRole(...SENIOR),  upload.single('photo'), updateStaffV2);
router.put('/:id/deactivate',  protect, requireRole(...SENIOR),  deactivateStaffV2);
router.put('/:id/activate',    protect, requireRole(...SENIOR),  activateStaffV2);
router.delete('/:id',          protect, requireRole(...SENIOR),  deleteStaffV2);

module.exports = router;