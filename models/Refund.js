const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Represents a refund request in the system.
 *
 * This model is separate from the Invoice model to clearly distinguish
 * payment lifecycle from the refund lifecycle. It holds all details
 * related to a single refund request.
 */
const refundSchema = new Schema({
  // A direct link to the Invoice this refund is for. This is a critical relationship.
  invoice: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true, // Index for faster lookups by invoice
  },
  // The reason provided by the customer for the refund request.
  reason: {
    type: String,
    required: [true, 'A reason for the refund is required.'],
    trim: true,
  },
  // The current status of the refund process.
  // NEW (Tier 3.2) — 'FAILED' added: previously a PayHere gateway failure
  // during approveRefund just returned a 502 to whichever admin happened to
  // click Approve at that moment (see controllers/refundController.js) —
  // nothing was ever written back to this document, so the refund silently
  // stayed 'PENDING' forever, indistinguishable from one nobody had tried
  // yet. Any other admin loading the dashboard saw no sign anything had
  // gone wrong. A real status value lets the failure persist and re-surface
  // for every admin, with a Retry action (see failureReason below).
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'FAILED'],
    default: 'PENDING',
  },
  // If the refund is rejected, the administrator must provide a reason.
  rejectionReason: {
    type: String,
    trim: true,
  },
  // NEW (Tier 3.2) — the payment gateway's own error message from the most
  // recent failed attempt, shown to admins on the FAILED card/modal so they
  // don't have to go dig through server logs. Cleared back to null on a
  // successful retry (see approveRefund).
  failureReason: { type: String, default: null },
  // The amount that was refunded. This is stored here for historical accuracy.
  refundedAmount: {
    type: Number,
    required: [true, 'Refunded amount must be specified.'],
  },

  // A.7: Extended fields for admin audit trail
  refundDate:      { type: Date, default: null },    // when the refund was actually processed
  paymentReference: { type: String, default: null },  // PayHere transaction/payment reference

// FIX: this was `new Schema({...}, {}, { timestamps: true })` — a THIRD
// argument, which Mongoose's Schema constructor doesn't accept (it only
// takes definition + options). The real options object ended up being the
// empty `{}` in the middle, and `{ timestamps: true }` was silently
// discarded — so every Refund document was being saved with no `createdAt`/
// `updatedAt` at all. FinancialDashboard.tsx's Refunds & Credit Notes tab
// displays `new Date(refund.createdAt)` for every refund — with this bug
// that's always been `new Date(undefined)`, i.e. "Invalid Date" shown to admins.
// Also removed the duplicate `refundedAmount` field definition above (harmless
// — the second one just silently overwrote the first — but confusing).
}, {
  // Automatically add `createdAt` and `updatedAt` timestamps.
  timestamps: true,
});

const Refund = mongoose.model('Refund', refundSchema);

module.exports = Refund;