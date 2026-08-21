const mongoose = require('mongoose');

// Payment transaction ledger — records each individual payment attempt
// (distinct from Invoice, which is the bill; this is the money movement).
// Ported from backend-payment-workflow. Not yet written to by any controller
// — added as groundwork for a future payment-reconciliation view.
const paymentSchema = new mongoose.Schema(
  {
    bookingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    amount:   { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'LKR' },

    method: {
      type: String,
      enum: ['cod', 'online', 'advance', 'pay-after-completion'],
      required: true,
    },
    status: {
      type:    String,
      enum:    ['pending', 'paid', 'failed', 'partial', 'refunded'],
      default: 'pending',
    },

    gatewayId:       { type: String },        // PayHere transaction ID
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },
    paidAt:          { type: Date },
    failureReason:   { type: String },
    ipnVerified:     { type: Boolean, default: false },
    metadata:        { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'payments' }
);

paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ customerId: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ method: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
