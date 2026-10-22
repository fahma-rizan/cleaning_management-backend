const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: {
      type: String,
      enum: ['earned', 'redeemed', 'reversed', 'expired', 'bonus'],
      required: true,
    },

    points: { type: Number, required: true }, // positive for earned/bonus, negative for redeemed/reversed/expired
    reason: { type: String, trim: true },

    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    // The specific successful payment that generated this transaction — a
    // booking can have multiple payments (advance, remaining, ...), each
    // capable of independently earning points, so 'earned' transactions are
    // anchored to the payment, not just the booking. Mandatory for 'earned'
    // transactions (enforced in loyaltyController.js, not at the schema
    // level, since other transaction types never have a paymentId).
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

    // currentBalance immediately after this transaction was applied — makes
    // the history self-explanatory without having to replay every prior
    // transaction to know the balance at any point in time.
    resultingBalance: { type: Number },
  },
  { timestamps: true }
);

// Fast idempotency lookups ("has this payment already been processed?") and
// fast "all earning/reversal transactions for this booking" aggregation.
loyaltyTransactionSchema.index({ paymentId: 1, type: 1 });
loyaltyTransactionSchema.index({ bookingId: 1, type: 1 });

module.exports = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
