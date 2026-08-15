const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { protect, adminOnly } = require('../middleware/authMiddleware');
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

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'staff'),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
    },
  }),
});

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

// ─── Admin panel v2 (feature/admin-dashboard) — no auth yet, see note in api.ts ────
// These are intentionally NOT behind `protect` because the new admin panel's
// lib/api.ts doesn't send a Bearer token yet ("Temporary mock token until auth
// finishes"). Tighten this once real admin auth is wired through.
router.get('/available',      getAvailableStaffV2);
router.get('/',                getAllStaffV2);
router.post('/',               upload.single('photo'), createStaffV2);

// ─── /:id wildcard routes — must stay last ─────────────────────────────────────
router.get('/:id',             getStaffByIdV2);
router.put('/:id',             upload.single('photo'), updateStaffV2);
router.put('/:id/deactivate',  deactivateStaffV2);
router.put('/:id/activate',    activateStaffV2);
router.delete('/:id',          deleteStaffV2);

module.exports = router;
