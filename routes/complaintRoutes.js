const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createComplaint, getAllComplaints, getComplaintById, updateStatus, updatePriority, assignStaff, addNote,
} = require('../controllers/complaintController');

router.post('/',               protect, createComplaint); // customer submits a complaint
router.get('/',                getAllComplaints);
router.get('/:id',             getComplaintById);
router.put('/:id/status',      updateStatus);
router.put('/:id/priority',    updatePriority);
router.put('/:id/assign',      assignStaff);
router.post('/:id/notes',      addNote);

module.exports = router;
