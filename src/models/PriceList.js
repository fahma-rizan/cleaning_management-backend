const mongoose = require('mongoose');

const priceListSchema = new mongoose.Schema(
  {
    serviceId: { type: Number, required: true, unique: true },
    serviceName: { type: String, required: true },
    category: { type: String, required: true },
    pricingType: {
      type: String,
      enum: ['per-sqft', 'per-item', 'per-seat', 'per-unit', 'fixed'],
      required: true,
    },
    pricing: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PriceList', priceListSchema);