const mongoose = require('mongoose');

// sku/name/unit match InventoryItem/MaterialRequest naming (lowercase `sku`).
const reportItemSchema = new mongoose.Schema({
  sku:               { type: String, required: true },
  name:              { type: String, required: true },
  unit:              { type: String, required: true },
  qtyAllocated:      { type: Number, required: true }, // copied from MaterialRequest at submit time
  qtyActualReported: { type: Number, required: true }, // staff's number
  qtyActualVerified: { type: Number, required: true }, // defaults to reported; admin may edit before verifying
}, { _id: false });

const completionReportSchema = new mongoose.Schema(
  {
    // unique: true is the actual "no duplicate reports per booking" guarantee
    // (a DB constraint, not just a UI check) — two staff submitting for the
    // same booking within the same moment still can't both succeed.
    bookingId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true },
    // No 'Staff' model exists in this codebase — staff are User documents
    // with role: 'staff' (same as MaterialRequest/Booking's own refs).
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    items: [reportItemSchema],

    // No reject/reopen state — admin edits qtyActualVerified directly (via
    // corrections passed to verifyCompletionReport) and then verifies. Once
    // verified a report is final; later fixes are a manual inventory
    // adjustment outside this flow.
    status: { type: String, enum: ['submitted', 'verified'], default: 'submitted' },

    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CompletionReport', completionReportSchema);
