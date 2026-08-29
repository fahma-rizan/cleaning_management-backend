const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

// @route   POST /api/audit/log
router.post('/log', auth, async (req, res, next) => {
  try {
    const { userId, userEmail, action, resource, resourceId, details, status } = req.body;

    if (!userId || !userEmail || !action || !resource) {
      return res.status(400).json({ msg: 'userId, userEmail, action, and resource are required.' });
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      (req.socket && req.socket.remoteAddress) ||
      'unknown';

    const logEntry = await AuditLog.create({
      userId,
      userEmail,
      action,
      resource,
      resourceId: resourceId || undefined,
      details:    details    || undefined,
      ipAddress,
      userAgent:  req.headers['user-agent'] || 'unknown',
      status:     status || 'success',
    });

    res.status(201).json(logEntry);
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/audit
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, action, resource, status, fromDate, toDate, page, limit } = req.query;

    const query = {};
    if (userId)   query.userId   = userId;
    if (action)   query.action   = action;
    if (resource) query.resource = resource;
    if (status)   query.status   = status;

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
    }

    const pageNum  = Math.max(1, parseInt(page  || '1',  10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit || '50', 10)));
    const skip     = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      logs,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/audit/recent
router.get('/recent', auth, async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

module.exports = router;