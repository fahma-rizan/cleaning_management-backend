const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    sku:  { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['consumable', 'equipment'], default: 'consumable' },

    quantity: { type: Number, required: true, default: 0 },
    unit:     { type: String, default: 'units' }, // litres, units, pieces...

    lowStockThreshold: { type: Number, default: 10 },
  },
  { timestamps: true }
);

// isLowStock is derived, not stored — always reflects current quantity vs threshold
inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.lowStockThreshold;
});
inventoryItemSchema.set('toJSON',   { virtuals: true });
inventoryItemSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
