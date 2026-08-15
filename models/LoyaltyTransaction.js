const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: {
      type: String,
      enum: ['earned', 'redeemed', 'reversed', 'expired', 'bonus'],
      required: true,
    },

    points: { type: Number, required: true }, // positive for earned/bonus, negative for redeemed/expired
    reason: { type: String, trim: true },

    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
