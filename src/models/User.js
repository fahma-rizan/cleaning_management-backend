const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// ─── Helper: sign JWT ─────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── Helper: send token response ──────────────────────────────────────────────
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      verified: user.verified,
      loyaltyPoints: user.loyaltyPoints,
      badge: user.badge,
      requiresPasswordChange: user.requiresPasswordChange,
    },
  });
};

// ─── Register ─────────────────────────────────────────────────────────────────
// POST /api/auth/register
const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already in use.' });
    }

    const user = await User.create({ name, email, password, phone, role: 'customer' });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ─── Get current user ─────────────────────────────────────────────────────────
// GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─── Change password ──────────────────────────────────────────────────────────
// PUT /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    user.requiresPasswordChange = false;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, changePassword };
