const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');

// ─── GET /api/inventory ─────────────────────────────────────────────────────────
const getItems = async (req, res) => {
  try {
    const { search, type } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku:  { $regex: search, $options: 'i' } },
      ];
    }
    if (type) filter.type = type;

    const items = await InventoryItem.find(filter).sort({ name: 1 });
    res.json({ items, pagination: { total: items.length } });
  } catch (err) {
    console.error('getItems error:', err);
    res.status(500).json({ error: 'Failed to load inventory items' });
  }
};

// ─── GET /api/inventory/low-stock ──────────────────────────────────────────────
// NOTE: must be registered before '/:id' in the route file.
const getLowStock = async (req, res) => {
  try {
    const items = await InventoryItem.find();
    const low = items.filter(i => i.quantity <= i.lowStockThreshold);
    res.json(low);
  } catch (err) {
    console.error('getLowStock error:', err);
    res.status(500).json({ error: 'Failed to load low-stock items' });
  }
};

// ─── GET /api/inventory/:id ─────────────────────────────────────────────────────
const getItem = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error('getItem error:', err);
    res.status(500).json({ error: 'Failed to load item' });
  }
};

// ─── POST /api/inventory ────────────────────────────────────────────────────────
const createItem = async (req, res) => {
  try {
    const { sku, name, type, quantity, unit, lowStockThreshold } = req.body;
    if (!sku || !name) return res.status(400).json({ error: 'SKU and name are required' });

    const existing = await InventoryItem.findOne({ sku });
    if (existing) return res.status(400).json({ error: 'An item with this SKU already exists' });

    const item = await InventoryItem.create({
      sku, name,
      type: type || 'consumable',
      quantity: quantity || 0,
      unit: unit || 'units',
      lowStockThreshold: lowStockThreshold ?? 10,
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('createItem error:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
};

// ─── PUT /api/inventory/:id ──────────────────────────────────────────────────────
const updateItem = async (req, res) => {
  try {
    const { name, type, unit, lowStockThreshold } = req.body;
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (name !== undefined) item.name = name;
    if (type !== undefined) item.type = type;
    if (unit !== undefined) item.unit = unit;
    if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;

    await item.save();
    res.json(item);
  } catch (err) {
    console.error('updateItem error:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
};

// ─── DELETE /api/inventory/:id ───────────────────────────────────────────────────
const deleteItem = async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteItem error:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
};

// ─── POST /api/inventory/:id/adjust ──────────────────────────────────────────────
// Body: { type: 'restock'|'deduct'|'return'|'adjustment', quantity, reference, notes }
const adjustStock = async (req, res) => {
  try {
    const { type, quantity, reference, notes } = req.body;
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const qty = Number(quantity) || 0;
    const previousQty = item.quantity;
    let newQty = previousQty;

    if (type === 'restock' || type === 'return') newQty = previousQty + qty;
    else if (type === 'deduct')                  newQty = Math.max(0, previousQty - qty);
    else if (type === 'adjustment')               newQty = qty;
    else return res.status(400).json({ error: 'Invalid adjustment type' });

    item.quantity = newQty;
    await item.save();

    const transaction = await InventoryTransaction.create({
      itemId: item._id, type, quantity: qty, previousQty, newQty, reference, notes,
    });

    res.json({ item, transaction });
  } catch (err) {
    console.error('adjustStock error:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
};

// ─── GET /api/inventory/:id/transactions ─────────────────────────────────────────
const getItemTransactions = async (req, res) => {
  try {
    const transactions = await InventoryTransaction.find({ itemId: req.params.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    console.error('getItemTransactions error:', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
};

module.exports = {
  getItems, getItem, createItem, updateItem, deleteItem, adjustStock, getLowStock, getItemTransactions,
};
