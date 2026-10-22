const Booking = require('../models/Booking');
const User    = require('../models/User');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const CompletionReport = require('../models/CompletionReport');

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

// ─── GET /api/reports/monthly?year&month ───────────────────────────────────────
// Per-item consumables report (Inventory > Monthly Report tab): every
// consumable item, with its actual verified consumption and actual restock
// quantity for the selected month — including items with zero activity.
//
// netConsumed comes from verified CompletionReports (items[].qtyActualVerified,
// matched by sku, filtered by verifiedAt) — NOT InventoryTransaction 'deduct'
// records. confirmMaterialRequest/verifyCompletionReport/handleBookingCancellation
// (services/materialRequestService.js, services/completionReportService.js)
// adjust InventoryItem.quantity directly and never write an InventoryTransaction
// row; that log only ever captures manual admin adjustments via adjustStock()
// in inventoryController.js. Allocation (qtyRequested at confirm time) and a
// staff's as-submitted usage (qtyActualReported) are both deliberately excluded
// — only the admin-verified figure counts as real consumption, and a report can
// only ever be verified once (unique bookingId, no reopen/reverify), so there's
// no double-counting risk.
//
// restocked comes from InventoryTransaction where type: 'restock' — the only
// thing that ever creates those rows is adjustStock's 'restock' branch (the
// Consumables tab's Restock action). Initial/seeded stock is never logged as
// a 'restock' transaction (seed.js sets InventoryItem.quantity directly), so
// it's correctly excluded with no special-casing.
//
// Equipment (InventoryItem.type === 'equipment') is excluded entirely.
const getMonthlyInventoryReport = async (req, res) => {
  try {
    const year  = Number(req.query.year)  || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1); // 1-12

    // Half-open range in server-local time — new Date(y, m, d) uses local
    // timezone components directly, unlike new Date('YYYY-MM-DD') (which
    // parses as UTC midnight and can silently drop end-of-month records).
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const consumables = await InventoryItem.find({ type: { $ne: 'equipment' } }).lean();

    const [verifiedReports, restockTxns] = await Promise.all([
      CompletionReport.find({ status: 'verified', verifiedAt: { $gte: start, $lt: end } }).select('items').lean(),
      InventoryTransaction.find({ type: 'restock', createdAt: { $gte: start, $lt: end } }).select('itemId quantity').lean(),
    ]);

    const consumedBySku = {};
    for (const report of verifiedReports) {
      for (const item of report.items) {
        consumedBySku[item.sku] = (consumedBySku[item.sku] || 0) + item.qtyActualVerified;
      }
    }

    const restockedByItemId = {};
    for (const t of restockTxns) {
      const key = String(t.itemId);
      restockedByItemId[key] = (restockedByItemId[key] || 0) + t.quantity;
    }

    const items = consumables.map(item => ({
      name: item.name,
      sku:  item.sku,
      type: item.type,
      netConsumed: Math.round((consumedBySku[item.sku] || 0) * 100) / 100,
      restocked:   Math.round((restockedByItemId[String(item._id)] || 0) * 100) / 100,
    }));

    res.json({ year, month, items });
  } catch (err) {
    console.error('getMonthlyInventoryReport error:', err);
    res.status(500).json({ error: 'Failed to generate monthly inventory report' });
  }
};

// ─── GET /api/reports/anomalies?year&month ─────────────────────────────────────
// Simple anomaly summary: items deducted far more than average (>2x median usage).
const getAnomalySummary = async (req, res) => {
  try {
    const year  = Number(req.query.year)  || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const deducts = await InventoryTransaction.find({ type: 'deduct', createdAt: { $gte: start, $lt: end } });
    const perItem = {};
    deducts.forEach(t => {
      const key = String(t.itemId);
      perItem[key] = (perItem[key] || 0) + t.quantity;
    });

    const values = Object.values(perItem).sort((a, b) => a - b);
    const median = values.length ? values[Math.floor(values.length / 2)] : 0;
    const threshold = median * 2 || 0;

    const items = await InventoryItem.find();
    const itemMap = Object.fromEntries(items.map(i => [String(i._id), i]));

    const anomalies = Object.entries(perItem)
      .filter(([, total]) => threshold > 0 && total > threshold)
      .map(([itemId, total]) => ({
        item: { name: itemMap[itemId]?.name, sku: itemMap[itemId]?.sku },
        totalDeducted: total,
        medianUsage: median,
      }));

    res.json({ year, month, anomalies });
  } catch (err) {
    console.error('getAnomalySummary error:', err);
    res.status(500).json({ error: 'Failed to generate anomaly summary' });
  }
};

// 'YYYY-MM-DD' → local calendar-day Date, same reasoning as getTodayLocalStr
// in utils/dateUtils.js: `new Date('YYYY-MM-DD')` parses as UTC midnight, not
// local midnight, which silently mis-buckets records near a day boundary.
// Building the Date from explicit y/m/d components uses the server's local
// timezone instead. Also rejects calendar-invalid dates (e.g. 2026-02-30),
// which the Date constructor would otherwise silently roll into March.
const parseLocalDateStrict = (str) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
};

// ─── GET /api/reports/inventory-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD ──
// Date-range consumables report: totalConsumed and totalRestocked.
//
// totalConsumed comes from verified CompletionReports (items[].qtyActualVerified,
// filtered by verifiedAt) — NOT from InventoryTransaction 'deduct' records,
// because confirmMaterialRequest/verifyCompletionReport/handleBookingCancellation
// (services/materialRequestService.js, services/completionReportService.js)
// adjust InventoryItem.quantity directly and never write an InventoryTransaction
// row; that log only ever captures manual admin adjustments via adjustStock()
// in inventoryController.js. Using 'deduct' transactions here would silently
// miss almost all real consumption under the current booking→material-request→
// completion-report flow, and would report allocation (qtyRequested at confirm
// time) rather than actual verified usage — exactly what this report must avoid.
//
// totalRestocked comes from InventoryTransaction where type: 'restock' — the
// only thing that ever creates those rows is adjustStock's 'restock' branch
// (the Admin Inventory tab's Restock action), so this is a complete, accurate
// source with no double-counting risk. Initial/seeded stock is never logged
// as a 'restock' transaction (seed.js sets InventoryItem.quantity directly),
// so it's correctly excluded without any special-casing.
//
// Both totals exclude equipment (InventoryItem.type === 'equipment') — the
// consumables-only rule already established for the rest of Inventory
// Management (Consumables tab, Material Requests, etc.).
const getInventoryRangeReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate) return res.status(400).json({ error: 'startDate is required' });
    if (!endDate)   return res.status(400).json({ error: 'endDate is required' });

    const start = parseLocalDateStrict(startDate);
    const end   = parseLocalDateStrict(endDate);
    if (!start || !end) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates in YYYY-MM-DD format' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'endDate cannot be earlier than startDate' });
    }

    // Half-open range so the entire end calendar day is included regardless
    // of what time of day records were created — matches getMonthlyInventoryReport's
    // $gte/$lt convention just above.
    const rangeStart = start;
    const rangeEnd   = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

    const invItems = await InventoryItem.find().select('sku type').lean();
    const consumableSkus    = new Set(invItems.filter(i => i.type !== 'equipment').map(i => i.sku));
    const consumableItemIds = new Set(invItems.filter(i => i.type !== 'equipment').map(i => String(i._id)));

    // ── Total Consumed — final verified usage only ──────────────────────────
    const verifiedReports = await CompletionReport.find({
      status: 'verified',
      verifiedAt: { $gte: rangeStart, $lt: rangeEnd },
    }).select('items').lean();

    let totalConsumed = 0;
    for (const report of verifiedReports) {
      for (const item of report.items) {
        if (consumableSkus.has(item.sku)) totalConsumed += item.qtyActualVerified;
      }
    }

    // ── Total Restocked — actual restock transactions only ──────────────────
    const restockTxns = await InventoryTransaction.find({
      type: 'restock',
      createdAt: { $gte: rangeStart, $lt: rangeEnd },
    }).select('itemId quantity').lean();

    const totalRestocked = restockTxns
      .filter(t => consumableItemIds.has(String(t.itemId)))
      .reduce((sum, t) => sum + t.quantity, 0);

    res.json({
      startDate,
      endDate,
      totalConsumed:  Math.round(totalConsumed * 100) / 100,
      totalRestocked: Math.round(totalRestocked * 100) / 100,
    });
  } catch (err) {
    console.error('getInventoryRangeReport error:', err);
    res.status(500).json({ error: 'Failed to generate inventory range report' });
  }
};

module.exports = {
  getBookingsReport, getPaymentsReport, getStaffPerformanceReport, getCustomersReport,
  getMonthlyInventoryReport, getAnomalySummary, getInventoryRangeReport,
};
