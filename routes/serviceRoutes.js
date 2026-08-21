const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} = require('../controllers/serviceController');

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTANT: literal paths must be registered before '/:id' below, or Express
// will match e.g. GET /api/services/all against GET /:id (with id="all").
// ══════════════════════════════════════════════════════════════════════════════

// ─── Public routes ───────────────────────────────────────────────────────────
router.get('/',    getAllServices);
router.get('/:id', getServiceById);

// ─── Admin-only routes ───────────────────────────────────────────────────────
router.post('/',      protect, adminOnly, createService);
router.put('/:id',    protect, adminOnly, updateService);
router.delete('/:id', protect, adminOnly, deleteService);

module.exports = router;
