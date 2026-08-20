const mongoose = require('mongoose');

const PriceListSchema = new mongoose.Schema({
  serviceId:   { type: Number, required: true, unique: true },
  serviceName: { type: String, required: true },
  category:    { type: String, required: true },
  pricingType: { type: String, required: true },
  pricing:     { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

module.exports = mongoose.model('PriceList', PriceListSchema);