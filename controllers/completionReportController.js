const CompletionReport = require('../models/CompletionReport');
const Booking = require('../models/Booking');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

const toResponse = (r) => {
  const b = r.bookingId || {};
  return {
    _id: r._id,
    booking: { bookingRef: b.bookingId || '', customerName: b.customerName || '' },
    employee: { name: r.submittedByName || '' },
    items: r.items,
    anomalyFlags: r.anomalyFlags,
    status: r.status,
    rejectionReason: r.rejectionReason,
    submittedAt: r.createdAt,
    createdAt: r.createdAt,
  };
};

// ─── GET /api/completion-reports ───────────────────────────────────────────────
const getReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const reports = await CompletionReport.find(filter).populate('bookingId').sort({ createdAt: -1 });
    res.json({ reports: reports.map(toResponse) });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ error: 'Failed to load completion reports' });
  }
};

// ─── GET /api/completion-reports/booking/:bookingId ────────────────────────────
const getReportByBooking = async (req, res) => {
  try {
    const report = await CompletionReport.findOne({ bookingId: req.params.bookingId }).populate('bookingId');
    if (!report) return res.status(404).json({ error: 'No completion report found for this booking' });
    res.json(toResponse(report));
  } catch (err) {
    console.error('getReportByBooking error:', err);
    res.status(500).json({ error: 'Failed to load completion report' });
  }
};

// ─── POST /api/completion-reports/booking/:bookingId ───────────────────────────
// Staff submits actual material usage for a completed job.
// Body: { submittedByName, items: [{itemType, itemId, name, sku, usedQty}], anomalyFlags }
const submitReport = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const { submittedByName, items = [], anomalyFlags = [] } = req.body;

    const report = await CompletionReport.create({
      bookingId: booking._id,
      submittedByName: submittedByName || booking.assignedStaffName || '',
      items,
      anomalyFlags,
    });

    res.status(201).json(toResponse(await report.populate('bookingId')));
  } catch (err) {
    console.error('submitReport error:', err);
    res.status(500).json({ error: 'Failed to submit completion report' });
  }
};

// ─── POST /api/completion-reports/:id/verify ───────────────────────────────────
// Body: { status: 'approved'|'rejected', rejectionReason? }
// On approval, deducts the reported usage from inventory stock.
const verifyReport = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const report = await CompletionReport.findById(req.params.id).populate('bookingId');
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.status = status;
    report.rejectionReason = status === 'rejected' ? (rejectionReason || '') : undefined;
    report.verifiedAt = new Date();
    await report.save();

    if (status === 'approved') {
      for (const line of report.items) {
        if (!line.itemId || !line.usedQty) continue;
        const item = await InventoryItem.findById(line.itemId);
        if (!item) continue;
        const previousQty = item.quantity;
        const newQty = Math.max(0, previousQty - line.usedQty);
        item.quantity = newQty;
        await item.save();
        await InventoryTransaction.create({
          itemId: item._id, type: 'deduct', quantity: line.usedQty, previousQty, newQty,
          reference: report.bookingId?.bookingId || '', notes: 'Auto-deducted from approved completion report',
        });
      }
    }

    res.json(toResponse(report));
  } catch (err) {
    console.error('verifyReport error:', err);
    res.status(500).json({ error: 'Failed to verify report' });
  }
};

module.exports = { getReports, getReportByBooking, submitReport, verifyReport };
