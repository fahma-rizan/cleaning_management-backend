const Booking            = require('../models/Booking');
const CompletionReport   = require('../models/CompletionReport');
const MaterialRequest    = require('../models/MaterialRequest');
const { submitCompletionReport, verifyCompletionReport } = require('../services/completionReportService');

// True if this staff member is assigned to the booking (single or team) —
// the same check startTask/completeTask use in bookingController.js.
const isAssignedToBooking = (booking, staffId) => {
  const sid = staffId.toString();
  if (booking.assignedStaffId && booking.assignedStaffId.toString() === sid) return true;
  return (booking.assignedTeam || []).some(m => m.staffId.toString() === sid);
};

// Admin-only view — submittedBy/verifiedBy are looked up here via populate,
// never duplicated onto the document itself.
const toResponse = (r) => {
  const b = r.bookingId || {};
  const staff = r.submittedBy || {};
  const verifier = r.verifiedBy || {};
  return {
    _id: r._id,
    bookingId: {
      _id: b._id || '',
      bookingRef: b.bookingId || '',
      customerName: b.customerName || '',
      scheduledDate: b.date || '',
      serviceType: b.serviceCategory || b.serviceName || '',
    },
    materialRequestId: r.materialRequestId,
    submittedBy: { _id: staff._id || '', name: staff.name || '', phone: staff.phone || '' },
    items: r.items,
    status: r.status,
    verifiedBy: verifier.name || '',
    verifiedAt: r.verifiedAt,
    createdAt: r.createdAt,
  };
};

// ─── GET /api/completion-reports (admin) ───────────────────────────────────────
const getReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const reports = await CompletionReport.find(filter)
      .populate('bookingId')
      .populate('submittedBy', 'name phone')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ reports: reports.map(toResponse) });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ error: 'Failed to load completion reports' });
  }
};

// ─── GET /api/completion-reports/booking/:bookingId (admin) ───────────────────
const getReportByBooking = async (req, res) => {
  try {
    const report = await CompletionReport.findOne({ bookingId: req.params.bookingId })
      .populate('bookingId')
      .populate('submittedBy', 'name phone')
      .populate('verifiedBy', 'name');
    if (!report) return res.status(404).json({ error: 'No completion report found for this booking' });
    res.json(toResponse(report));
  } catch (err) {
    console.error('getReportByBooking error:', err);
    res.status(500).json({ error: 'Failed to load completion report' });
  }
};

// ─── GET /api/completion-reports/booking/:bookingId/allocation (staff) ────────
// What the "Record Material Usage" form renders — the confirmed MaterialRequest's
// allocated items for this booking. Only the assigned staff (or an admin) may see it.
const getAllocationForBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && !isAssignedToBooking(booking, req.user._id)) {
      return res.status(403).json({ error: 'Not assigned to this booking' });
    }

    const existingReport = await CompletionReport.findOne({ bookingId: booking._id });
    if (existingReport) {
      return res.status(400).json({ error: 'A completion report already exists for this booking' });
    }

    const materialRequest = await MaterialRequest.findOne({ bookingId: booking._id, status: 'confirmed' });
    if (!materialRequest) {
      return res.status(404).json({ error: 'No confirmed material request found for this booking' });
    }

    res.json({
      booking: {
        bookingRef: booking.bookingId,
        customerName: booking.customerName,
        serviceType: booking.serviceCategory || booking.serviceName,
        scheduledDate: booking.date,
      },
      items: materialRequest.items.map(i => ({ sku: i.sku, name: i.name, unit: i.unit, qtyAllocated: i.qtyRequested })),
    });
  } catch (err) {
    console.error('getAllocationForBooking error:', err);
    res.status(500).json({ error: 'Failed to load allocation' });
  }
};

// ─── POST /api/completion-reports/booking/:bookingId (staff) ──────────────────
// Body: { items: [{ sku, qty }] } — data entry only, does not touch inventory.
const submitReport = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!isAssignedToBooking(booking, req.user._id)) {
      return res.status(403).json({ error: 'Not assigned to this booking' });
    }

    const { items = [] } = req.body;
    const report = await submitCompletionReport(booking._id, req.user._id, items);
    res.status(201).json(toResponse(await report.populate([{ path: 'bookingId' }, { path: 'submittedBy', select: 'name phone' }])));
  } catch (err) {
    // E11000 = the unique bookingId index caught a race between co-assigned staff
    const status = err.code === 11000 ? 400
      : /not found|must be marked|already exists/i.test(err.message) ? 400
      : 500;
    if (status === 500) console.error('submitReport error:', err);
    res.status(status).json({ error: err.code === 11000 ? 'A completion report already exists for this booking' : err.message });
  }
};

// ─── POST /api/completion-reports/:id/verify (admin) ───────────────────────────
// Body: { corrections?: [{ sku, qtyActualVerified }] }
const verifyReport = async (req, res) => {
  try {
    const { corrections } = req.body;
    const { report, warnings } = await verifyCompletionReport(req.params.id, req.user._id, corrections);
    const populated = await report.populate([
      { path: 'bookingId' }, { path: 'submittedBy', select: 'name phone' }, { path: 'verifiedBy', select: 'name' },
    ]);
    res.json({ ...toResponse(populated), warnings });
  } catch (err) {
    console.error('verifyReport error:', err);
    const status = err.message === 'Completion report not found' ? 404
      : err.message === 'Only submitted reports can be verified' ? 400
      : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to verify report' : err.message });
  }
};

module.exports = { getReports, getReportByBooking, getAllocationForBooking, submitReport, verifyReport };
