const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    discountType:  { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true },

    code: { type: String, required: true, trim: true, uppercase: true },

    validFrom: { type: String }, // YYYY-MM-DD
    validTo:   { type: String }, // YYYY-MM-DD

    // Which service IDs this offer applies to; ['all'] = every service
    applicableServices: { type: [String], default: ['all'] },

    minAmount: { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offer', offerSchema);
