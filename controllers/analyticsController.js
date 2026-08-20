const Invoice = require('../models/Invoice');
const Refund  = require('../models/Refund');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

const rangeStart = (range) => {
  const days = RANGE_DAYS[range] || 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

// Buckets the range into at most ~12 points so the charts stay readable
// (daily buckets for 7d/30d, weekly for 90d, monthly for 1y).
const bucketKey = (date, range) => {
  if (range === '1y') return date.toISOString().slice(0, 7); // YYYY-MM
  if (range === '90d') {
    const week = Math.floor(date.getDate() / 7);
    return `${date.toISOString().slice(0, 7)}-W${week}`;
  }
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
};

// ─── GET /api/analytics/revenue?range= ─────────────────────────────────────────
const getRevenue = async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const since = rangeStart(range);

    const invoices = await Invoice.find({ createdAt: { $gte: since } }).lean();
    const refunds  = await Refund.find({ createdAt: { $gte: since }, status: /^approved$/i }).lean();

    const buckets = new Map();
    for (const inv of invoices) {
      const key = bucketKey(new Date(inv.createdAt), range);
      const b = buckets.get(key) || { date: key, revenue: 0, transactions: 0, refunds: 0 };
      b.revenue += inv.paidAmount || 0;
      b.transactions += 1;
      buckets.set(key, b);
    }
    for (const r of refunds) {
      const key = bucketKey(new Date(r.createdAt), range);
      const b = buckets.get(key) || { date: key, revenue: 0, transactions: 0, refunds: 0 };
      b.refunds += r.amount || 0;
      buckets.set(key, b);
    }

    const data = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    const totalRevenue      = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const totalTransactions = invoices.length;
    const totalRefunds      = refunds.reduce((s, r) => s + (r.amount || 0), 0);
    const totalCustomers    = new Set(invoices.map(i => i.customer?.email).filter(Boolean)).size;
    const avgOrderValue     = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    res.json({
      data,
      summary: {
        totalRevenue,
        totalTransactions,
        totalRefunds,
        totalCustomers,
        avgOrderValue,
        conversionRate: 0,
      },
    });
  } catch (err) {
    console.error('getRevenue error:', err);
    res.status(500).json({ message: 'Failed to load revenue analytics.' });
  }
};

// ─── GET /api/analytics/services?range= ───────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const since = rangeStart(req.query.range || '30d');
    const invoices = await Invoice.find({ createdAt: { $gte: since } }).lean();

    const byService = new Map();
    let totalRevenue = 0;
    for (const inv of invoices) {
      const name = inv.serviceItems?.[0]?.name || 'Other';
      const revenue = inv.paidAmount || 0;
      totalRevenue += revenue;
      const s = byService.get(name) || { serviceType: name, count: 0, revenue: 0, percentage: 0 };
      s.count += 1;
      s.revenue += revenue;
      byService.set(name, s);
    }

    const result = Array.from(byService.values()).map(s => ({
      ...s,
      percentage: totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 1000) / 10 : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('getServices error:', err);
    res.status(500).json({ message: 'Failed to load service analytics.' });
  }
};

// ─── GET /api/analytics/payment-methods?range= ────────────────────────────────
const getPaymentMethods = async (req, res) => {
  try {
    const since = rangeStart(req.query.range || '30d');
    const invoices = await Invoice.find({ createdAt: { $gte: since } }).lean();

    const byMethod = new Map();
    let totalAmount = 0;
    for (const inv of invoices) {
      const method = inv.paymentMethod || 'Unknown';
      const amount = inv.paidAmount || 0;
      totalAmount += amount;
      const m = byMethod.get(method) || { method, count: 0, amount: 0, percentage: 0 };
      m.count += 1;
      m.amount += amount;
      byMethod.set(method, m);
    }

    const result = Array.from(byMethod.values()).map(m => ({
      ...m,
      percentage: totalAmount > 0 ? Math.round((m.amount / totalAmount) * 1000) / 10 : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('getPaymentMethods error:', err);
    res.status(500).json({ message: 'Failed to load payment method analytics.' });
  }
};

// ─── GET /api/analytics/customers?range= ──────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const since = rangeStart(req.query.range || '30d');
    const invoices = await Invoice.find({ createdAt: { $gte: since } }).lean();

    const byCustomer = new Map();
    for (const inv of invoices) {
      const email = inv.customer?.email || 'unknown';
      const c = byCustomer.get(email) || {
        customerId: String(inv.customer?.userId || email),
        name: inv.customer?.name || 'Unknown',
        email,
        totalSpent: 0,
        bookingCount: 0,
        lastBooking: inv.createdAt,
        loyaltyPoints: 0,
      };
      c.totalSpent += inv.paidAmount || 0;
      c.bookingCount += 1;
      if (new Date(inv.createdAt) > new Date(c.lastBooking)) c.lastBooking = inv.createdAt;
      byCustomer.set(email, c);
    }

    const result = Array.from(byCustomer.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    res.json(result);
  } catch (err) {
    console.error('getCustomers error:', err);
    res.status(500).json({ message: 'Failed to load customer analytics.' });
  }
};

module.exports = { getRevenue, getServices, getPaymentMethods, getCustomers };
