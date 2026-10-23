const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  createComplaint, getAllComplaints, getComplaintById, updateStatus, updatePriority, assignStaff, addNote,
  getAssignedComplaints, updateStatusByStaff,
} = require('../controllers/complaintController');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];
const SENIOR  = ['Super Admin', 'Main Admin'];

router.post('/',               protect, createComplaint); // customer submits a complaint — any logged-in user
router.get('/assigned',        protect, getAssignedComplaints); // staff: complaints assigned to them — must precede '/:id'
router.put('/:id/staff-status', protect, updateStatusByStaff);  // staff: move a status they own forward
router.get('/',                protect, requireRole(...ALLOWED), getAllComplaints);
router.get('/:id',              protect, requireRole(...ALLOWED), getComplaintById);
router.put('/:id/status',      protect, requireRole(...ALLOWED), updateStatus);
router.put('/:id/priority',    protect, requireRole(...ALLOWED), updatePriority);
router.put('/:id/assign',      protect, requireRole(...SENIOR),  assignStaff);
router.post('/:id/notes',      protect, requireRole(...ALLOWED), addNote);

module.exports = router;