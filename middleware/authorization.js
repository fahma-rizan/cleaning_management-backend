/**
 * Admin Authorization Middleware
 * Restricts access to admin/manager roles only
 */

const adminOnly = (req, res, next) => {
  try {
    // req.user should be set by verifyToken middleware
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No user found' });
    }

    const { role } = req.user;

    // Allow admin and manager roles
    if (!['admin', 'manager'].includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only admins and managers can access this resource',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const staffOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No user found' });
    }

    const { role } = req.user;

    // Allow staff, admin, and manager roles
    if (!['staff', 'admin', 'manager'].includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only staff members and above can access this resource',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { adminOnly, staffOnly };
