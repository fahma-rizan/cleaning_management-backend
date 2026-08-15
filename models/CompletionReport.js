const mongoose = require('mongoose');

const completionReportSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // staff who submitted
    submittedByName: { type: String },

    items: [{
      itemType: { type: String, enum: ['consumable', 'equipment'] },
      itemId:   { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
      name:     { type: String },
      sku:      { type: String },
      usedQty:  { type: Number, default: 0 },
    }],

    anomalyFlags: [{ type: String }], // e.g. 'over-budget-materials', 'unusual-duration'

    status: {
      type:    String,
      enum:    ['pending_verification', 'approved', 'rejected'],
      default: 'pending_verification',
    },
    rejectionReason: { type: String },
    verifiedBy:       { type: String },
    verifiedAt:        { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CompletionReport', completionReportSchema);
