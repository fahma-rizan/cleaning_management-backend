const Booking = require('../models/Booking');
const Refund  = require('../models/Refund');
const User    = require('../models/User');

// ─── GET /api/payments/overview ────────────────────────────────────────────────
// Summary cards + a revenue-over-time series for the admin Payments tab.
const getOverview = async (req, res) => {
  try {
    const paidBookings = await Booking.find({ paidAmount: { $gt: 0 } });
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

    // Case-insensitive status match — a pre-existing Refund collection from
    // another branch stores status uppercase ('APPROVED'); ours writes lowercase.
    const pendingRefunds  = await Refund.countDocuments({ status: /^pending$/i });
    const approvedRefunds = await Refund.find({ status: /^approved$/i }).lean();
    // Also tolerate the other schema's 'refundedAmount' field name.
    const totalRefunded = approvedRefunds.reduce((sum, r) => sum + (r.amount || r.refundedAmount || 0), 0);

    // Last 7 months revenue series — {date, revenue} matches RevenueChart's prop shape
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const months = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), monthIdx: d.getMonth(), label: monthNames[d.getMonth()] });
    }
    const revenueSeries = months.map(({ year, monthIdx, label }) => {
      const revenue = paidBookings
        .filter(b => {
          const d = new Date(b.updatedAt);
          return d.getFullYear() === year && d.getMonth() === monthIdx;
        })
        .reduce((sum, b) => sum + (b.paidAmount || 0), 0);
      return { date: label, revenue };
    });

    res.json({
      totalRevenue,
      totalInvoices: paidBookings.length,
      pendingRefunds,
      totalRefunded,
      revenueSeries,
    });
  } catch (err) {
    console.error('getOverview error:', err);
    res.status(500).json({ error: 'Failed to load payments overview' });
  }
};

// ─── GET /api/payments/invoices ────────────────────────────────────────────────
// Every booking that has some payment activity, treated as an "invoice" row.
const getInvoices = async (req, res) => {
  try {
    const bookings = await Booking.find({ $or: [{ paidAmount: { $gt: 0 } }, { price: { $gt: 0 } }] })
      .sort({ createdAt: -1 })
      .select('bookingId customerName customerEmail serviceName price paidAmount balanceAmount paymentMethod paymentStatus status date createdAt');
    res.json(bookings);
  } catch (err) {
    console.error('getInvoices error:', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
};

// ─── GET /api/payments/refunds ─────────────────────────────────────────────────
const getRefunds = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = new RegExp(`^${status}$`, 'i');
    const refunds = await Refund.find(filter).sort({ createdAt: -1 }).lean();
    // Normalise both schema shapes into one consistent response.
    const normalised = refunds.map(r => ({
      _id:          r._id,
      bookingRef:   r.bookingRef || r.invoice || '',
      customerName: r.customerName || '',
      amount:       r.amount ?? r.refundedAmount ?? 0,
      reason:       r.reason || '',
      status:       (r.status || '').toLowerCase(),
      createdAt:    r.createdAt,
    }));
    res.json(normalised);
  } catch (err) {
    console.error('getRefunds error:', err);
    res.status(500).json({ error: 'Failed to load refunds' });
  }
};

// ─── POST /api/payments/refunds ────────────────────────────────────────────────
// Body: { bookingId, amount, reason }
const createRefund = async (req, res) => {
  try {
    const { bookingId, amount, reason } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const refund = await Refund.create({
      bookingId:    booking._id,
      bookingRef:   booking.bookingId,
      customerId:   booking.customerId,
      customerName: booking.customerName,
      amount:       amount || booking.paidAmount,
      reason:       reason || '',
    });
    res.status(201).json(refund);
  } catch (err) {
    console.error('createRefund error:', err);
    res.status(500).json({ error: 'Failed to create refund request' });
  }
};

// ─── PUT /api/payments/refunds/:id/approve ─────────────────────────────────────
const approveRefund = async (req, res) => {
  try {
    const refund = await Refund.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', reviewNote: req.body.note || '', reviewedAt: new Date() },
      { new: true }
    );
    if (!refund) return res.status(404).json({ error: 'Refund not found' });
    res.json(refund);
  } catch (err) {
    console.error('approveRefund error:', err);
    res.status(500).json({ error: 'Failed to approve refund' });
  }
};

// ─── PUT /api/payments/refunds/:id/reject ──────────────────────────────────────
const rejectRefund = async (req, res) => {
  try {
    const refund = await Refund.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', reviewNote: req.body.note || '', reviewedAt: new Date() },
      { new: true }
    );
    if (!refund) return res.status(404).json({ error: 'Refund not found' });
    res.json(refund);
  } catch (err) {
    console.error('rejectRefund error:', err);
    res.status(500).json({ error: 'Failed to reject refund' });
  }
};

module.exports = { getOverview, getInvoices, getRefunds, createRefund, approveRefund, rejectRefund };
