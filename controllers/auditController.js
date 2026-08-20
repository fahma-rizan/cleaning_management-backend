const AuditLog = require('../models/AuditLog');

// ─── POST /api/audit/log ───────────────────────────────────────────────────────
const logAction = async (req, res) => {
  try {
    const { userId, userEmail, action, resource, resourceId, details, status, userAgent } = req.body;
    if (!userId || !userEmail || !action || !resource) {
      return res.status(400).json({ message: 'userId, userEmail, action and resource are required.' });
    }
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip;

    const entry = await AuditLog.create({
      userId, userEmail, action, resource, resourceId, details,
      status: status || 'success',
      ipAddress,
      userAgent,
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('auditLog error:', err);
    res.status(500).json({ message: 'Failed to record audit log.' });
  }
};

module.exports = { logAction };
