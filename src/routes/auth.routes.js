const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe, changePassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  register
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

// GET /api/auth/me  (protected)
router.get('/me', protect, getMe);

// PUT /api/auth/change-password  (protected)
router.put('/change-password', protect, changePassword);

module.exports = router;
