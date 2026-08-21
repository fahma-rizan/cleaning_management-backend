const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const PaymentReminder = require('../models/PaymentReminder');

router.use(protect);

// ─── GET /api/payment-reminders/stats ───────────────────────────────────────────
// Must be declared before '/' — no dynamic segments here, but kept for clarity
// and consistency with the source branch's ordering note.
router.get('/stats', async (req, res) => {
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
          count:  { $sum: 1 },
          sent:   { $sum: { $cond: [{ $eq: ['$status', 'sent'] },   1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
    ]);

    res.json({
      total:  stats.reduce((s, r) => s + r.count,  0),
      sent:   stats.reduce((s, r) => s + r.sent,   0),
      failed: stats.reduce((s, r) => s + r.failed, 0),
      byType: stats.reduce((acc, r) => { acc[r._id] = { total: r.count, sent: r.sent, failed: r.failed }; return acc; }, {}),
    });
  } catch (error) {
    console.error('Error fetching reminder stats:', error);
    res.status(500).json({ error: 'Failed to fetch reminder statistics' });
  }
});

// ─── GET /api/payment-reminders ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { invoiceId, type, page = 1, limit = 50 } = req.query;
    const query = {};
    if (invoiceId) query.invoiceId    = invoiceId;
    if (type)      query.reminderType = type;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const [reminders, total] = await Promise.all([
      PaymentReminder.find(query).sort({ sentAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      PaymentReminder.countDocuments(query),
    ]);

    res.json({
      reminders,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Error fetching payment reminders:', error);
    res.status(500).json({ error: 'Failed to fetch payment reminders' });
  }
});

// ─── POST /api/payment-reminders ────────────────────────────────────────────────
// Manually log a reminder (the scheduler is the usual writer — see
// utils/reminderScheduler.js — this exists for manual/testing use).
router.post('/', async (req, res) => {
  try {
    const { invoiceId, invoiceNumber, customerId, customerEmail, amount, dueDate, reminderType, status } = req.body;

    if (!invoiceId || !invoiceNumber || !customerId || !customerEmail || !amount || !dueDate || !reminderType) {
      return res.status(400).json({
        error: 'Missing required fields: invoiceId, invoiceNumber, customerId, customerEmail, amount, dueDate, reminderType',
      });
    }

    const reminder = await PaymentReminder.create({
      invoiceId, invoiceNumber, customerId, customerEmail, amount, dueDate, reminderType,
      status: status || 'pending',
    });

    res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creating payment reminder:', error);
    res.status(500).json({ error: 'Failed to create payment reminder' });
  }
});

module.exports = router;
