const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// A couple of pages in the payment-invoice-notifications feature set send
// the token as `x-auth-token` instead of `Authorization: Bearer` — accept
// both instead of hard-failing on the "wrong" header name.
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.headers['x-auth-token']) return req.headers['x-auth-token'];
  return null;
};

const protect = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = await User.findById(decoded.id).select('-password');
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed.' });
  }
};

// Like `protect`, but never blocks the request — just attaches req.user
// when a valid token is present. Used on routes that several
// payment-invoice-notifications pages call without an auth header at all;
// failing those requests outright would break the UI, so we authenticate
// on a best-effort basis instead.
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = await User.findById(decoded.id).select('-password');
  } catch (error) {
    // ignore — treat as unauthenticated
  }
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) return next();
  return res.status(403).json({ success: false, message: 'Admin access required.' });
};

module.exports = { protect, optionalAuth, adminOnly };
