const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },

    type: {
      type: String,
      enum: ['restock', 'deduct', 'return', 'adjustment'],
      required: true,
    },

    quantity:    { type: Number, required: true }, // amount involved in this transaction
    previousQty: { type: Number, required: true },
    newQty:      { type: Number, required: true },

    reference: { type: String, trim: true }, // e.g. booking ID or PO number
    notes:     { type: String, trim: true },

    performedBy: { type: String }, // admin name/email
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
