const express = require('express');
const { protect, authorise } = require('../middleware/auth.middleware');
const {
  getProfile,
  updateProfile,
  getAllUsers,
  updateUser,
  deleteUser,
} = require('../controllers/user.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/users/profile
// PUT  /api/users/profile
router.route('/profile').get(getProfile).put(updateProfile);

// GET    /api/users          (admin only)
// PUT    /api/users/:id      (admin only)
// DELETE /api/users/:id      (admin only)
router.route('/').get(authorise('admin'), getAllUsers);
router.route('/:id')
  .put(authorise('admin'), updateUser)
  .delete(authorise('admin'), deleteUser);

module.exports = router;
