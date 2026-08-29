const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');

// Helper function to get date range
const getDateRange = (range) => {
  const now = new Date();
  const ranges = {
    '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    '1y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
  };
  return { start: ranges[range] || ranges['30d'], end: now };
};

// Revenue analytics
//
// FIX: The original aggregation had a $match filter of status IN ['PAID','PARTIAL']
//      and then inside $group tried to sum refunds with $eq status 'REFUNDED'.
//      Because REFUNDED invoices are excluded by the $match, the refund sum was
//      always 0. Fixed by running a separate parallel aggregation for refunds.
router.get('/revenue', async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const { start, end } = getDateRange(range);

    const [revenueData, refundData] = await Promise.all([
      // Revenue: PAID and PARTIAL invoices
      Invoice.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: { $in: ['PAID', 'PARTIAL'] },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$paidAmount' }, // Use paidAmount, not totalAmount
            transactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // FIX: Separate aggregation for REFUNDED invoices so they are not
      //      excluded by the PAID/PARTIAL filter above
      Invoice.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: 'REFUNDED',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            refunds: { $sum: '$totalAmount' },
          },
        },
      ]),
    ]);

    // Merge refund totals into revenue data by date
    const refundByDate = {};
    refundData.forEach(r => { refundByDate[r._id] = r.refunds; });

    const mergedData = revenueData.map(item => ({
      date: item._id,
      revenue: item.revenue,
      transactions: item.transactions,
      refunds: refundByDate[item._id] || 0,
      net: item.revenue - (refundByDate[item._id] || 0),
    }));

    // Summary stats
    const totalRevenue = revenueData.reduce((s, i) => s + i.revenue, 0);
    const totalTransactions = revenueData.reduce((s, i) => s + i.transactions, 0);
    const totalRefunds = refundData.reduce((s, i) => s + i.refunds, 0);

    res.json({
      data: mergedData,
      summary: {
        totalRevenue,
        totalTransactions,
        totalRefunds,
        netRevenue: totalRevenue - totalRefunds,
        avgOrderValue: totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0,
      },
    });

  } catch (error) {
    next(error);
  }
});

// Service analytics
//
// FIX (this pass): the $lookup below joined each Booking to EVERY Invoice
// that references it — and an 'advance-balance' booking that's gone through
// completion now correctly has TWO linked invoices (the original + its
// -BAL settlement, see routes/booking.js). $unwind on that array turned one
// booking into two rows before the serviceItems were unwound and summed,
// silently doubling that booking's service revenue here. The invoice fields
// were never even read in the $group stage below — this lookup was dead
// weight that also happened to corrupt the count once bookings could have
// more than one invoice. Removed; this aggregation only ever needed Booking
// data in the first place.
//
// FIX (earlier pass, still true): grouping is on serviceItems[], not a
// nonexistent Booking.serviceType field.
router.get('/services', async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const { start, end } = getDateRange(range);

    const serviceData = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ['completed', 'confirmed', 'in-progress'] },
        },
      },
      // Unwind serviceItems to group by individual service name
      { $unwind: { path: '$serviceItems', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$serviceItems.name',
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$serviceItems.price', 0] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const totalRevenue = serviceData.reduce((sum, s) => sum + s.revenue, 0);

    const services = serviceData.map(s => ({
      serviceType: s._id || 'Unknown',
      count: s.count,
      revenue: s.revenue,
      percentage: totalRevenue > 0 ? parseFloat(((s.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }));

    res.json(services);

  } catch (error) {
    next(error);
  }
});

// Payment method analytics
//
// FIX (this pass): the Invoice model DOES have a top-level paymentMethod
// field (models/Invoice.js — added specifically so every invoice records
// which of the 4 real workflow methods it belongs to: 'Full Online',
// 'Advance + Balance', 'Cash on Delivery', 'Online Payment After
// Completion', plus the two balance-settlement variants). The previous
// fallback of deriving Online-vs-Cash purely from payherePaymentId presence
// collapsed all 4 methods into 2 generic buckets and couldn't distinguish
// them for reporting or a demo. Grouping on the real field now.
router.get('/payment-methods', async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const { start, end } = getDateRange(range);

    const paymentData = await Invoice.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ['PAID', 'PARTIAL', 'UNPAID', 'SENT'] },
        },
      },
      {
        $group: {
          _id: { $cond: [{ $in: ['$paymentMethod', [null, '']] }, 'Unspecified', '$paymentMethod'] },
          count: { $sum: 1 },
          amount: { $sum: '$paidAmount' },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    const totalAmount = paymentData.reduce((sum, m) => sum + m.amount, 0);

    const methods = paymentData.map(m => ({
      method: m._id || 'Unknown',
      count: m.count,
      amount: m.amount,
      percentage: totalAmount > 0 ? parseFloat(((m.amount / totalAmount) * 100).toFixed(1)) : 0,
    }));

    res.json(methods);

  } catch (error) {
    next(error);
  }
});

// Customer analytics
//
// FIX: The original had a $lookup joining invoices.bookingId (String) to
//      bookings._id (ObjectId) — always empty due to type mismatch.
//      The booking sub-document was also never used in the $group stage,
//      so the $lookup was pointless overhead. Removed the unused $lookup.
router.get('/customers', async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const { start, end } = getDateRange(range);

    // FIX: Removed the broken and unused $lookup on bookings
    const customerData = await Invoice.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $in: ['PAID', 'PARTIAL'] },
        },
      },
      {
        $group: {
          _id: '$customer.userId',
          name: { $first: '$customer.name' },
          email: { $first: '$customer.email' },
          totalSpent: { $sum: '$paidAmount' },
          bookingCount: { $sum: 1 },
          lastBooking: { $max: '$createdAt' },
          loyaltyPoints: { $sum: { $multiply: ['$paidAmount', 0.1] } },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 50 },
    ]);

    const customers = customerData.map(c => ({
      customerId: c._id || 'unknown',
      name: c.name || 'Unknown Customer',
      email: c.email || 'unknown@example.com',
      totalSpent: c.totalSpent,
      bookingCount: c.bookingCount,
      lastBooking: c.lastBooking ? new Date(c.lastBooking).toISOString().split('T')[0] : 'N/A',
      loyaltyPoints: Math.floor(c.loyaltyPoints),
    }));

    res.json(customers);

  } catch (error) {
    next(error);
  }
});

// Dashboard summary
router.get('/summary', async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    const { start, end } = getDateRange(range);

    const [revenueStats, customerStats, bookingStats] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: { $in: ['PAID', 'PARTIAL'] },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$paidAmount' },
            totalTransactions: { $sum: 1 },
            avgOrderValue: { $avg: '$paidAmount' },
          },
        },
      ]),

      Invoice.distinct('customer.userId', {
        createdAt: { $gte: start, $lte: end },
        status: { $in: ['PAID', 'PARTIAL'] },
      }),

      Booking.countDocuments({
        createdAt: { $gte: start, $lte: end },
        status: { $in: ['completed', 'confirmed', 'in-progress'] },
      }),
    ]);

    const summary = {
      totalRevenue: revenueStats[0]?.totalRevenue || 0,
      totalTransactions: revenueStats[0]?.totalTransactions || 0,
      avgOrderValue: Math.round(revenueStats[0]?.avgOrderValue || 0),
      totalCustomers: customerStats.length,
      totalBookings: bookingStats,
      conversionRate:
        bookingStats > 0
          ? parseFloat((((revenueStats[0]?.totalTransactions || 0) / bookingStats) * 100).toFixed(1))
          : 0,
    };

    res.json(summary);

  } catch (error) {
    next(error);
  }
});

module.exports = router;