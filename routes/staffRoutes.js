const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  createStaff,
  toggleAvailability,
  getAllStaff,
  getMyPerformance,
  getReassignmentData,
  getMyProfile,
  updateMyProfile,
} = require('../controllers/staffController');

router.use(protect);

router.post('/create',          adminOnly, createStaff);        // admin
router.patch('/availability',   toggleAvailability);             // staff
router.get('/performance',      getMyPerformance);               // staff
router.get('/all',              adminOnly, getAllStaff);          // admin
router.get('/reassignments',    adminOnly, getReassignmentData);  // admin
router.get('/me',               getMyProfile);                   // staff
router.patch('/profile',        updateMyProfile);                // staff

module.exports = router;
