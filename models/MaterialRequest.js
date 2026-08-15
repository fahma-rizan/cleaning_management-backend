const mongoose = require('mongoose');

const materialRequestSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },

    items: [{
      itemType:     { type: String, enum: ['consumable', 'equipment'] },
      itemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
      name:         { type: String },
      sku:          { type: String },
      requestedQty: { type: Number, required: true },
      inStock:      { type: Number },   // snapshot of stock at request time
      sufficient:   { type: Boolean },  // inStock >= requestedQty, computed at request time
    }],

    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    rejectionReason: { type: String },
    approvedBy:       { type: String },
    approvedAt:        { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaterialRequest', materialRequestSchema);
