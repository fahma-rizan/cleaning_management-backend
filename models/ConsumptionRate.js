const mongoose = require('mongoose');

// How much of each consumable a service uses per unit of its consumption
// factor (per 100 sqft / per seat / per mattress / per curtain). Read by the
// (future) auto-generation of a MaterialRequest when a booking is made.
const scalingItemSchema = new mongoose.Schema({
  sku:        { type: String, required: true },
  qtyPerUnit: { type: Number, required: true },
}, { _id: false });

const fixedItemSchema = new mongoose.Schema({
  sku: { type: String, required: true },
  qty: { type: Number, required: true },
}, { _id: false });

const sizeVariantSchema = new mongoose.Schema({
  size:              { type: String, enum: ['king', 'queen', 'double', 'single'], required: true },
  items:             [fixedItemSchema],
  topOnlyMultiplier: { type: Number, default: 0.5 },
}, { _id: false });

const consumptionRateSchema = new mongoose.Schema(
  {
    serviceId: { type: Number, required: true },

    // Some services (House Deep Cleaning, Commercial Cleaning) only have a
    // single row in the `services` collection, but 3 rate profiles in
    // `pricelists.pricing.types[].id` ('normal' | 'move-in-out' |
    // 'after-construction'). variant distinguishes those; it's null for
    // every service that only has one rate profile.
    variant: {
      type: String,
      enum: ['normal', 'move-in-out', 'after-construction', null],
      default: null,
    },

    serviceName: { type: String, required: true }, // for readability/debugging only

    unitBasis: {
      type: String,
      enum: ['per_100_sqft', 'per_seat', 'per_mattress', 'per_curtain', 'none'],
      required: true,
    },

    scalingItems: [scalingItemSchema],
    fixedItems:   [fixedItemSchema],
    sizeVariants: [sizeVariantSchema], // only populated when unitBasis = 'per_mattress'

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One rate profile per (service, variant) — variant is null for services
// with a single profile, so this still enforces one document per plain
// serviceId in that case.
consumptionRateSchema.index({ serviceId: 1, variant: 1 }, { unique: true });

module.exports = mongoose.model('ConsumptionRate', consumptionRateSchema, 'consumptionrates');
