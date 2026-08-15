const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

// ─── GET /api/alerts ────────────────────────────────────────────────────────────
// Currently-active low-stock alerts (derived live from inventory, not stored).
const getActiveAlerts = async (req, res) => {
  try {
    const items = await InventoryItem.find();
    const active = items
      .filter(i => i.quantity <= i.lowStockThreshold)
      .map(i => ({
        _id: i._id,
        item: { _id: i._id, name: i.name, sku: i.sku, type: i.type, quantity: i.quantity, unit: i.unit, lowStockThreshold: i.lowStockThreshold },
        triggeredAt: i.updatedAt,
      }));
    res.json(active);
  } catch (err) {
    console.error('getActiveAlerts error:', err);
    res.status(500).json({ error: 'Failed to load active alerts' });
  }
};

// ─── GET /api/alerts/history ────────────────────────────────────────────────────
// Restocks that brought a previously-low item back above its threshold.
const getAlertHistory = async (req, res) => {
  try {
    const restocks = await InventoryTransaction.find({ type: { $in: ['restock', 'adjustment'] } })
      .sort({ createdAt: -1 })
      .limit(100);

    const items = await InventoryItem.find();
    const itemMap = Object.fromEntries(items.map(i => [String(i._id), i]));

    const resolved = restocks
      .filter(t => {
        const item = itemMap[String(t.itemId)];
        return item && t.previousQty <= item.lowStockThreshold && t.newQty > item.lowStockThreshold;
      })
      .map(t => {
        const item = itemMap[String(t.itemId)];
        return {
          _id: t._id,
          item: { name: item?.name, sku: item?.sku, type: item?.type, unit: item?.unit },
          resolvedAt: t.createdAt,
          restockedTo: t.newQty,
        };
      });

    res.json(resolved);
  } catch (err) {
    console.error('getAlertHistory error:', err);
    res.status(500).json({ error: 'Failed to load alert history' });
  }
};

module.exports = { getActiveAlerts, getAlertHistory };
