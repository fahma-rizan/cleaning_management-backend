const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const { getActiveCleaners, getCompletedToday, updateStatus } = require('../controllers/gpsController');

const ALLOWED = ['Super Admin', 'Main Admin', 'Operations Manager'];

router.get('/active-cleaners',            protect, requireRole(...ALLOWED), getActiveCleaners);
router.get('/completed-today',            protect, requireRole(...ALLOWED), getCompletedToday);
// Left open (no requireRole), same as the old backend — staff devices call
// this to push their own live location and aren't admin users.
router.put('/cleaners/:staffId/status',   updateStatus);

module.exports = router;