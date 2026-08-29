const express = require('express');
const router  = express.Router();
const PaymentReminder = require('../models/PaymentReminder');
const auth    = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// FIX: Route order — /stats is a literal route and must appear BEFORE any
// dynamic route would shadow it. Defined first here for clarity.
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/payment-reminders/stats
// @desc   Get reminder statistics by type and status
// @access Private (admin)
//
// FIX: Added auth middleware.
router.get('/stats', auth, async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    const now = new Date();
    const ranges = {
      '7d':  new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    };
    const startDate = ranges[range] || ranges['30d'];

    const stats = await PaymentReminder.aggregate([
      { $match: { sentAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$reminderType',
          count: { $sum: 1 },
          sent:   { $sum: { $cond: [{ $eq: ['$status', 'sent']   }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
    ]);

    const summary = {
      total:  stats.reduce((s, r) => s + r.count,  0),
      sent:   stats.reduce((s, r) => s + r.sent,   0),
      failed: stats.reduce((s, r) => s + r.failed, 0),
      byType: stats.reduce((acc, r) => {
        acc[r._id] = { total: r.count, sent: r.sent, failed: r.failed };
        return acc;
      }, {}),
    };

    res.json(summary);
  } catch (error) {
    console.error('Error fetching reminder stats:', error);
    res.status(500).json({ error: 'Failed to fetch reminder statistics' });
  }
});

// @route  GET /api/payment-reminders
// @desc   Get payment reminders with optional filters and pagination
// @access Private (admin)
//
// FIX 1: Added auth middleware.
// FIX 2: Replaced the hardcoded .limit(50) with page/limit query params so
//         admins can paginate through all records rather than silently missing
//         anything beyond the first 50.
router.get('/', auth, async (req, res) => {
  try {
    const { invoiceId, type, page = 1, limit = 50 } = req.query;

    const query = {};
    if (invoiceId) query.invoiceId    = invoiceId;
    if (type)      query.reminderType = type;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip     = (pageNum - 1) * limitNum;

    const [reminders, total] = await Promise.all([
      PaymentReminder.find(query)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limitNum),
      PaymentReminder.countDocuments(query),
    ]);

    res.json({
      reminders,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching payment reminders:', error);
    res.status(500).json({ error: 'Failed to fetch payment reminders' });
  }
});

// @route  POST /api/payment-reminders
// @desc   Log a new payment reminder
// @access Private (admin/system)
//
// FIX 1: Added auth middleware — previously fully unauthenticated, allowing
//         anyone to create arbitrary reminder records in the database.
// FIX 2: Destructure only the expected fields from req.body instead of
//         passing the raw body directly into the model constructor. This
//         prevents callers from injecting unexpected fields.
router.post('/', auth, async (req, res) => {
  try {
    const {
      invoiceId,
      invoiceNumber,
      customerId,
      customerEmail,
      amount,
      dueDate,
      reminderType,
      status,
    } = req.body;

    if (!invoiceId || !invoiceNumber || !customerId || !customerEmail || !amount || !dueDate || !reminderType) {
      return res.status(400).json({
        error: 'Missing required fields: invoiceId, invoiceNumber, customerId, customerEmail, amount, dueDate, reminderType',
      });
    }

    const reminder = new PaymentReminder({
      invoiceId,
      invoiceNumber,
      customerId,
      customerEmail,
      amount,
      dueDate,
      reminderType,
      status: status || 'pending',
    });

    await reminder.save();
    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating payment reminder:', error);
    res.status(500).json({ error: 'Failed to create payment reminder' });
  }
});

module.exports = router;