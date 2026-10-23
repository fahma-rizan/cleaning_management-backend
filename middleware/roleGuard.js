// Restores the 4-tier admin access control from the old backend
// ('Super Admin' | 'Main Admin' | 'Operations Manager' | 'Customer Support').
//
// Must run AFTER `protect` (middleware/authMiddleware.js), which populates
// req.user from the JWT. `protect` only tells us someone is logged in;
// this tells us which admin sub-role they are, same as the old
// middleware/roleGuard.js did with req.admin.adminRole — just pointed at
// the new req.user.adminRole field on the unified User model.
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.adminRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
};

module.exports = { requireRole };