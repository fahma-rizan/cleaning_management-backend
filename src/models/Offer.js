const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },
    applicableServices: {
      type: [Number], // serviceId list; empty means all services
      default: [],
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    maxUsagePerUser: {
      type: Number,
      default: 1,
    },
    totalUsageLimit: {
      type: Number,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    badge: {
      type: String, // e.g. 'New', 'Hot', 'Limited'
    },
    badgeColor: {
      type: String,
      default: 'blue',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offer', offerSchema);
