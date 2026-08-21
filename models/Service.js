const mongoose = require('mongoose');

// Service catalog — backs the customer-facing Services page (service list,
// pricing preview, ratings). Adapted from feature/services-page into the
// shared backend structure/conventions.
const serviceSchema = new mongoose.Schema(
  {
    serviceId: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['home', 'laundry', 'shampoo', 'curtain'],
    },
    mainServiceType: {
      type: String,
      enum: ['Home/Office Cleaning', 'Laundry', 'Shampoo and Vacuum Cleaning', 'Curtain Cleaning'],
    },
    description: {
      type: String,
      required: true,
    },
    basePrice: {
      type: Number, // Base price in LKR
      required: true,
    },
    priceLabel: {
      type: String, // e.g. "From LKR 8,000"
    },
    duration: {
      type: String, // e.g. "4-6 hours"
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviews: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
    },
    features: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', serviceSchema);
