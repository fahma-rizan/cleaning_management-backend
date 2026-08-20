const User = require('../models/User');

// ─── GET /api/users/profile ───────────────────────────────────────────────────
const getProfile = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─── PUT /api/users/profile ───────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'address', 'profileImage'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/users  (admin only) ────────────────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), users });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/users/:id  (admin only) ────────────────────────────────────────
const updateUser = async (req, res, next) => {
  try {
    const { role, adminRole, verified, loyaltyPoints } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, adminRole, verified, loyaltyPoints },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/users/:id  (admin only) ─────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProfile, updateProfile, getAllUsers, updateUser, deleteUser };
