const mongoose = require('mongoose');

const priceReductionSchema = new mongoose.Schema({
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true,
  },
  requestedAmount: {
    type: Number,
    required: [true, 'Requested reduction amount is required.'],
    min: [1, 'Reduction amount must be at least Rs. 1.'],
  },
  approvedAmount: {
    type: Number,
    default: null,
  },
  reason: {
    type: String,
    required: [true, 'A reason for the price reduction is required.'],
    trim: true,
  },
  status: {
    type: String,
    // NEW — AWAITING_BANK_DETAILS: an intermediate state for a cash-paid
    // invoice's refund. Approving no longer finalizes the refund
    // immediately for cash — see approveReduction/submitBankDetails/
    // completeRefund in priceReductionController.js. Reductions on
    // online-paid or not-yet-paid invoices skip straight from PENDING to
    // APPROVED as before.
    enum: ['PENDING', 'AWAITING_BANK_DETAILS', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  // Tracks whether the reduction was a refund (already paid) or an invoice adjustment (not yet paid)
  reductionType: {
    type: String,
    enum: ['REFUND', 'ADJUSTMENT'],
    default: null,
  },

  // ── A.8 Post-service price reduction enhancements ─────────────────────────
  // Photos / documents uploaded as evidence for the request
  photos: [{
    type: String,      // data URL or file path
    description: String,
  }],
  // Staff members who worked on the job (for quality tracking & accountability)
  staffAssigned: [{
    staffId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    staffName:   { type: String },
    staffEmail:  { type: String },
  }],
  // When original payment was COD (cash), flag that the customer needs to
  // choose a refund method (see refundMethod below — this flag itself
  // predates the choice existing, kept for backward compatibility with
  // records/queries that already check it).
  bankDetailsRequested: { type: Boolean, default: false },
  // NEW (Tier 4.1, audit finding "In-person cash pickup option — missing")
  // — spec asks for both bank-transfer AND in-person pickup to be offered
  // for a cash-paid refund; only bank transfer existed. The customer picks
  // one on the self-service page (RefundBankDetailsPage.tsx) that already
  // existed for bank details alone. `null` = not chosen yet (still
  // AWAITING_BANK_DETAILS with no response).
  refundMethod: {
    type: String,
    enum: ['BANK_TRANSFER', 'CASH_PICKUP'],
    default: null,
  },
  // Customer's optional note for a pickup (e.g. a preferred day/time) —
  // the pickup equivalent of bankDetails below.
  pickupNotes: { type: String, trim: true },
  // When an admin actually hands over the cash in person and completes the
  // refund (see completeRefund's pickup branch) — the pickup equivalent of
  // refundDate on the Refund model.
  pickupConfirmedAt: { type: Date },
  // NEW — timestamps for the self-service refund-method flow, so the admin
  // dashboard can show "waiting 2 days" instead of just a boolean. Set on
  // EITHER choice, not just bank transfer, despite the field's original
  // bank-specific name (kept as-is rather than a risky rename).
  bankDetailsRequestedAt: { type: Date },
  bankDetailsSubmittedAt: { type: Date },
  bankDetails: {
    accountHolder: { type: String },
    bankName:      { type: String },
    accountNumber: { type: String },
    branch:        { type: String },
  },
  manualRefundReason: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('PriceReduction', priceReductionSchema);