const mongoose = require('mongoose');

// sku/name/unit match the naming already used by InventoryItem/ConsumptionRate
// (lowercase `sku`, not `SKU`).
const requestItemSchema = new mongoose.Schema({
  sku:             { type: String, required: true },
  name:            { type: String, required: true },
  qtyRequested:    { type: Number, required: true },
  unit:            { type: String, required: true },
  // true if qtyRequested > available stock at confirm time — a warning only,
  // never a reason to block confirmation (see confirmMaterialRequest).
  lowStockWarning: { type: Boolean, default: false },
}, { _id: false });

const materialRequestSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    serviceId: { type: Number, required: true },

    // No 'rejected' — there is no reject flow. Low stock at confirm time is
    // surfaced as a warning (items[].lowStockWarning) but never blocks
    // confirmation; a request can only end up 'cancelled' via the booking
    // it's linked to being cancelled (see handleBookingCancellation).
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },

    items: [requestItemSchema],

    // Set true only when the cancellation happened after confirmMaterialRequest
    // had already deducted stock (so handleBookingCancellation restores it) —
    // distinguishes that case from a plain pending → cancelled transition.
    cancelledAfterConfirmation: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaterialRequest', materialRequestSchema);
