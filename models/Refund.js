const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    // Not required — some invoices (older/legacy documents in this shared
    // collection) don't have a linked Booking ObjectId. bookingRef (string)
    // below is the reliable identifier.
    bookingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    bookingRef:    { type: String },        // Booking.bookingId, denormalised for display
    invoiceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // set by the new /api/refunds flow
    // Mixed, not ObjectId — invoice.customer.userId can be a legacy
    // placeholder string (e.g. "user-001") rather than a real Mongo _id.
    customerId:    { type: mongoose.Schema.Types.Mixed },
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
