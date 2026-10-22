// CompletionReport lifecycle — staff submission (data entry only, no stock
// change) and admin verification (the trusted checkpoint that actually
// reconciles inventory against real usage).
const Booking           = require('../models/Booking');
const MaterialRequest   = require('../models/MaterialRequest');
const CompletionReport  = require('../models/CompletionReport');
const InventoryItem     = require('../models/InventoryItem');

// ─── Staff: submit actual material usage for a completed booking ──────────────
async function submitCompletionReport(bookingId, staffId, reportedItems) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');
  if (booking.status !== 'completed') {
    throw new Error('Booking must be marked completed before submitting material usage');
  }

  const existing = await CompletionReport.findOne({ bookingId });
  if (existing) {
    throw new Error('A completion report already exists for this booking');
  }

  const materialRequest = await MaterialRequest.findOne({ bookingId, status: 'confirmed' });
  if (!materialRequest) {
    throw new Error('No confirmed material request found for this booking');
  }

  const items = materialRequest.items.map(allocated => {
    const reported = reportedItems.find(r => r.sku === allocated.sku);
    const qtyActualReported = reported ? Number(reported.qty) || 0 : 0;
    return {
      sku: allocated.sku,
      name: allocated.name,
      unit: allocated.unit,
      qtyAllocated: allocated.qtyRequested,
      qtyActualReported,
      qtyActualVerified: qtyActualReported, // admin may change this before verifying
    };
  });

  // unique index on bookingId is the real guard against a race between two
  // co-assigned staff submitting at the same moment — this create() throws
  // (E11000) if that happens, which the caller surfaces as a 400.
  return CompletionReport.create({
    bookingId,
    materialRequestId: materialRequest._id,
    submittedBy: staffId,
    items,
    status: 'submitted',
  });
}

// ─── Admin: verify a submitted report, reconciling inventory ──────────────────
// delta = allocated - actualVerified. Normally positive (over-allocation
// policy) and returned to stock; negative means actual usage exceeded
// allocation — surfaced as a non-blocking warning, same pattern as
// confirmMaterialRequest's low-stock warnings.
async function verifyCompletionReport(reportId, adminId, corrections) {
  const report = await CompletionReport.findById(reportId);
  if (!report) throw new Error('Completion report not found');
  if (report.status !== 'submitted') {
    throw new Error('Only submitted reports can be verified');
  }

  if (Array.isArray(corrections)) {
    for (const c of corrections) {
      const item = report.items.find(i => i.sku === c.sku);
      if (item) item.qtyActualVerified = Number(c.qtyActualVerified);
    }
  }

  const warnings = [];
  for (const item of report.items) {
    const delta = item.qtyAllocated - item.qtyActualVerified;
    if (delta < 0) {
      warnings.push({ sku: item.sku, name: item.name, allocated: item.qtyAllocated, actual: item.qtyActualVerified });
    }
    if (delta !== 0) {
      await InventoryItem.incrementQuantity(item.sku, delta);
    }
  }

  report.status     = 'verified';
  report.verifiedBy = adminId;
  report.verifiedAt = new Date();
  await report.save();

  return { report, warnings };
}

module.exports = { submitCompletionReport, verifyCompletionReport };
