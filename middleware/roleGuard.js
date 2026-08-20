const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.adminRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { requireRole };