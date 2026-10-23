const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    sku:  { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Free-form category slug (e.g. 'consumable', 'equipment', 'floor_chemical',
    // 'general_cleaner', ...) rather than a fixed enum — the DB already holds a
    // wide variety of legacy category values, and an enum here rejects saving
    // *any* change to those documents (adjustStock/updateItem call .save(),
    // which re-validates the whole document, not just the changed fields).
    type: { type: String, trim: true, default: 'consumable' },

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

// Atomic increment + round-to-2-decimals in one op — every stock write that
// applies a computed delta (confirmMaterialRequest, handleBookingCancellation,
// verifyCompletionReport) should go through this rather than a raw $inc.
// Fractional deltas (0.6, 0.33, ...) can't be represented exactly in IEEE754,
// so repeated $inc calls slowly accumulate noise like 24.400000000000002 —
// rounding after every write keeps the stored value clean instead of letting
// it compound across transactions. The pipeline form keeps this atomic
// (no separate read-modify-write round trip that could race another writer).
inventoryItemSchema.statics.incrementQuantity = function (sku, delta) {
  return this.updateOne(
    { sku },
    [{ $set: { quantity: { $round: [{ $add: ['$quantity', delta] }, 2] } } }]
  );
};

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
