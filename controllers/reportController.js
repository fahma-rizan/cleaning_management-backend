const Booking = require('../models/Booking');
const User    = require('../models/User');

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash on Delivery',
  cod:  'Cash on Delivery',
  card: 'Card Payment',
  online: 'Online Payment',
  'pay-after-completion': 'Pay After Completion',
  'advance-balance': 'Advance + Balance',
  'full-online': 'Full Online Payment',
};

// ─── GET /api/reports/bookings ───────────────────────────────────────────────────────
const getBookingsReport = async (req, res) => {
  try {
    const { from, to, service, status } = req.query;
    const filter = {};
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }
    if (service) filter.serviceCategory = service;
    if (status)  filter.status = status;

    const bookings = await Booking.find(filter).sort({ date: -1 }).lean();
    const withLabels = bookings.map(b => ({
      ...b,
      paymentMethodName: PAYMENT_METHOD_LABELS[b.paymentMethod] || b.paymentMethod || '',
    }));

    const summary = {
      totalBookings: bookings.length,
      totalRevenue:  bookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0),
      completed:     bookings.filter(b => b.status === 'completed').length,
      cancelled:     bookings.filter(b => b.status === 'cancelled').length,
    };

    res.json({ bookings: withLabels, summary });
  } catch (err) {
    console.error('getBookingsReport error:', err);
    res.status(500).json({ error: 'Failed to generate booking report' });
  }
};

// ─── GET /api/reports/payments ───────────────────────────────────────────────────────
const getPaymentsReport = async (req, res) => {
  try {
    const { period, method } = req.query;
    const filter = { paidAmount: { $gt: 0 } };

    if (period && period !== 'All') {
      const days = { '7d': 7, '30d': 30, '90d': 90 }[period] || null;
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        filter.createdAt = { $gte: since };
      }
    }
    if (method) filter.paymentMethod = method;

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).lean();
    const withLabels = bookings.map(b => ({
      ...b,
      paymentMethodName: PAYMENT_METHOD_LABELS[b.paymentMethod] || b.paymentMethod || '',
    }));
    const total = bookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

    res.json({ bookings: withLabels, total });
  } catch (err) {
    console.error('getPaymentsReport error:', err);
    res.status(500).json({ error: 'Failed to generate payment report' });
  }
};

// ─── GET /api/reports/staff-performance ──────────────────────────────────────────────
const getStaffPerformanceReport = async (req, res) => {
  try {
    const { staff: staffName } = req.query;
    const filter = { role: 'staff' };
    if (staffName && staffName !== 'All Staff') filter.name = staffName;

    const staffList = await User.find(filter).select('name email rating jobsCompleted isAvailable');

    const withStats = await Promise.all(
      staffList.map(async (s) => {
        const completed = await Booking.countDocuments({ assignedStaffId: s._id, status: 'completed' });
        return {
          _id:           s._id,
          name:          s.name,
          rating:        s.rating || 0,
          jobsCompleted: completed,
          status:        s.isAvailable ? 'Active' : 'Inactive',
        };
      })
    );

    const summary = {
      totalStaff:     withStats.length,
      avgRating:      withStats.length ? (withStats.reduce((sum, s) => sum + s.rating, 0) / withStats.length).toFixed(1) : '0.0',
      totalJobsDone:  withStats.reduce((sum, s) => sum + s.jobsCompleted, 0),
    };

    res.json({ staff: withStats, summary });
  } catch (err) {
    console.error('getStaffPerformanceReport error:', err);
    res.status(500).json({ error: 'Failed to generate staff performance report' });
  }
};

// ─── GET /api/reports/customers ──────────────────────────────────────────────────────
const getCustomersReport = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { role: 'customer' };
    if (status && status !== 'All') filter.status = status;

    const customers = await User.find(filter).select('name email phone status loyaltyPoints');

    const withStats = await Promise.all(
      customers.map(async (c) => {
        const bookings = await Booking.find({ customerId: c._id });
        return {
          _id:           c._id,
          name:          c.name,
          email:         c.email,
          phone:         c.phone || '',
          status:        c.status || 'active',
          totalBookings: bookings.length,
          totalSpent:    bookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0),
          loyaltyPoints: c.loyaltyPoints || 0,
        };
      })
    );

    res.json(withStats);
  } catch (err) {
    console.error('getCustomersReport error:', err);
    res.status(500).json({ error: 'Failed to generate customer report' });
  }
};

module.exports = {
  getBookingsReport, getPaymentsReport, getStaffPerformanceReport, getCustomersReport,
};
