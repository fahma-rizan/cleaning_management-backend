const mongoose = require('mongoose');

const priceReductionSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    bookingId: { type: String },
    customerName: { type: String },

    requestedAmount: { type: Number, required: true },
    reason:          { type: String, trim: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    approvedAmount: { type: Number },
    reviewNote:     { type: String },
    reviewedAt:     { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PriceReduction', priceReductionSchema);
