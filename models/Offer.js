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

    // Which service IDs this offer applies to, matching Settings.priceLists'
    // numeric serviceId — was [String] with 'all' as a sentinel value, which
    // doesn't fit real numeric service IDs at all. An empty array now means
    // "applies to every service" instead of relying on that string sentinel.
    applicableServices: { type: [Number], default: [] },

    // Renamed from minAmount — was never actually exposed on the admin form,
    // so nothing depended on the old name.
    minOrderAmount:  { type: Number, default: 0 },
    maxUsagePerUser: { type: Number, default: 1 },
    // Running count of total redemptions. NOTE: nothing currently increments
    // this — there's no per-user usage tracking anywhere in the app yet, so
    // maxUsagePerUser is stored but not actually enforced at checkout. That
    // would need a usage log keyed by customer + offer to build properly.
    usedCount: { type: Number, default: 0 },

    badge:      { type: String, trim: true }, // e.g. "Hot", "New", "Limited" — shown as a small tag on the offer
    badgeColor: { type: String, enum: ['blue', 'green', 'orange'], default: 'blue' },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offer', offerSchema);