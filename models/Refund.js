const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    bookingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    bookingRef:    { type: String },        // Booking.bookingId, denormalised for display
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerName:  { type: String },

    amount: { type: Number, required: true },
    reason: { type: String, trim: true },

    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    reviewedBy:   { type: String },   // admin name/email who approved/rejected
    reviewNote:   { type: String },
    reviewedAt:   { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', refundSchema);
