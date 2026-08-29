const mongoose = require('mongoose');

// NOTE: this model already existed (unused — nothing in this folder
// required it yet), presumably scaffolded earlier as part of the shared
// multi-member schema pass (models/Booking.js has the same "MASTER MODEL —
// shared by all 5 members" history). Built on top of it rather than
// introducing a second, differently-shaped Payment concept. Changes made
// below, all additive/widening (nothing existing was narrowed or removed):
//   - `direction` is new — CHARGE vs REFUND. Needed because `status` alone
//     describes this event's own outcome, not which way the money moved;
//     recomputeInvoiceAmounts (utils/paymentLedger.js) needs to sum charges
//     and subtract refunds, and can't tell those apart from `status` alone.
//   - `method` enum: added 'cash' — the original 4 values (cod/online/
//     advance/pay-after-completion) describe which BOOKING payment scheme
//     this was, but none of them describe the actual collection channel
//     for a cash-in-hand balance settlement, COD collection, or cash
//     refund — so 'cash' had no valid value to record under previously.
//   - `invoiceId` — made required. Every payment in this ledger always
//     ties back to a specific Invoice (that's the whole point: Invoice.
//     paidAmount/balanceAmount are now derived by summing these); leaving
//     it optional risked orphaned entries recompute could never attribute.
//   - `currency` default — 'USD' to 'LKR' (this app is Rs/LKR throughout;
//     nothing reads this field yet, so correcting the default is free).
const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'LKR',
    },
    // NEW — CHARGE (money collected) or REFUND (money paid back out).
    // See the file-level note above for why this couldn't just be
    // inferred from `status`.
    direction: {
      type: String,
      enum: ['CHARGE', 'REFUND'],
      required: true,
      default: 'CHARGE',
    },
    method: {
      type: String,
      enum: ['cod', 'online', 'advance', 'pay-after-completion', 'cash'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'partial', 'refunded'],
      default: 'pending',
    },
    // Free-text label for what this event actually was ("Advance payment",
    // "Balance settlement (cash)", "Cash refund — price reduction") —
    // for humans reading the ledger; logic branches on `direction`/`method`
    // instead. Kept separate from `metadata` (below) for quick display
    // without having to shape-check a Mixed field.
    label: {
      type: String,
      default: '',
    },
    gatewayId: {
      type: String,
      description: 'Payment gateway transaction ID (e.g., PayHere transaction ID)',
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Full response from payment gateway',
    },
    paidAt: {
      type: Date,
      description: 'When payment was completed',
    },
    failureReason: {
      type: String,
      description: 'Reason if payment failed',
    },
    ipnVerified: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Additional data (e.g., reference numbers, notes)',
    },
    audit: {
      createdBy: mongoose.Schema.Types.ObjectId,
      updatedBy: mongoose.Schema.Types.ObjectId,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
    collection: 'payments',
  }
);

// Indexes
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ customerId: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ method: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
