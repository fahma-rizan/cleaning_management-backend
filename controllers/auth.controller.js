const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, adminRole: user.adminRole },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // password has `select: false` in the schema, so it must be explicitly requested
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password. Please try again.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password. Please try again.' });
    }

    // Customers must verify their email via OTP before logging in
    if (user.role === 'customer' && !user.isVerified) {
      return res.status(200).json({
        success: false,
        requiresVerification: true,
        email: user.email,
      });
    }

    user.lastActive = new Date();
    await user.save();

    const token = signToken(user);

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      verified: user.isVerified,
      requiresPasswordChange: user.requiresPasswordChange,
      loyaltyPoints: user.loyaltyPoints,
      badge: user.badge,
      profilePhoto: user.profilePhoto,
    };

    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};