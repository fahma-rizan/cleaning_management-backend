// MaterialRequest lifecycle — generation from a booking, confirmation
// (deduct stock, warn on shortage, never block), and cancellation
// (restore stock only if it was actually deducted).
const ConsumptionRate = require('../models/ConsumptionRate');
const InventoryItem   = require('../models/InventoryItem');
const MaterialRequest = require('../models/MaterialRequest');

// The only booking.cleaningType values that are actually a consumptionrates
// `variant` (House Deep Cleaning / Commercial Cleaning's pricing tiers).
// Every other service's cleaningType value ('general' | 'floor' |
// 'cut-polish', or unset) maps to variant: null, matching how those
// services were seeded — the serviceId alone identifies their rate.
const VALID_VARIANTS = ['normal', 'move-in-out', 'after-construction'];

const resolveVariant = (cleaningType) => (VALID_VARIANTS.includes(cleaningType) ? cleaningType : null);

// ─── Generate a MaterialRequest from a newly-created booking ──────────────────
async function generateMaterialRequest(booking) {
  if (booking.serviceId === undefined || booking.serviceId === null) return null;

  const rate = await ConsumptionRate.findOne({
    serviceId: Number(booking.serviceId),
    variant: resolveVariant(booking.cleaningType),
    isActive: true,
  });
  if (!rate || rate.unitBasis === 'none') return null; // laundry services — no material request

  let computedItems = [];

  if (rate.unitBasis === 'per_mattress') {
    const size = (booking.mattressSize || '').toLowerCase();
    const sizeRate = rate.sizeVariants.find(v => v.size === size);
    if (!sizeRate) return null; // no matching size profile (e.g. size wasn't set) — nothing to generate

    const isTopOnly = (booking.mattressCleaningLevel || '').toLowerCase() === 'top only';
    const multiplier = isTopOnly ? sizeRate.topOnlyMultiplier : 1;
    computedItems = sizeRate.items.map(i => ({ sku: i.sku, qty: i.qty * multiplier }));
  } else {
    const unitCount =
      rate.unitBasis === 'per_100_sqft' ? (Number(booking.squareFeet) || 0) / 100 :
      rate.unitBasis === 'per_seat'     ? Number(booking.sofaSeatingCapacity) || 0 :
      rate.unitBasis === 'per_curtain'  ? Number(booking.curtainQuantity) || 0 : 0;

    computedItems = rate.scalingItems.map(i => ({ sku: i.sku, qty: i.qtyPerUnit * unitCount }));
  }

  rate.fixedItems.forEach(f => computedItems.push({ sku: f.sku, qty: f.qty }));

  // Merge by SKU in case the same item appears in both a scaling/size list
  // and the fixed list — keeps one row per SKU rather than a duplicate.
  const qtyBySku = new Map();
  for (const i of computedItems) qtyBySku.set(i.sku, (qtyBySku.get(i.sku) || 0) + i.qty);

  const skus = [...qtyBySku.keys()];
  const inventoryDocs = await InventoryItem.find({ sku: { $in: skus } });

  const finalItems = skus.map(sku => {
    const inv = inventoryDocs.find(d => d.sku === sku);
    return {
      sku,
      name: inv?.name || sku,
      unit: inv?.unit || '',
      qtyRequested: Math.round(qtyBySku.get(sku) * 100) / 100,
    };
  });

  return MaterialRequest.create({
    bookingId: booking._id,
    serviceId: Number(booking.serviceId),
    status: 'pending',
    items: finalItems,
  });
}

// ─── Confirm a pending MaterialRequest ─────────────────────────────────────────
// Deducts stock regardless of what's on hand — low stock is a warning, never
// a blocker. There is no reject flow.
async function confirmMaterialRequest(requestId) {
  const request = await MaterialRequest.findById(requestId);
  if (!request) throw new Error('Material request not found');
  if (request.status !== 'pending') {
    throw new Error('Only pending material requests can be confirmed');
  }

  const skus = request.items.map(i => i.sku);
  const inventoryDocs = await InventoryItem.find({ sku: { $in: skus } });

  const warnings = [];
  for (const item of request.items) {
    const inv = inventoryDocs.find(d => d.sku === item.sku);
    const available = inv?.quantity ?? 0;
    item.lowStockWarning = available < item.qtyRequested;
    if (item.lowStockWarning) {
      warnings.push({ sku: item.sku, name: item.name, available, requested: item.qtyRequested });
    }
  }

  // Deduct regardless of warnings — can go negative, which is the real
  // shortage signal the business needs to act on.
  for (const item of request.items) {
    await InventoryItem.incrementQuantity(item.sku, -item.qtyRequested);
  }

  request.status = 'confirmed';
  await request.save();

  return { request, warnings };
}

// ─── Shared cancellation entry point ───────────────────────────────────────────
// Called from both the customer-initiated and company-initiated booking
// cancellation paths — restores stock only if confirmMaterialRequest had
// already deducted it.
async function handleBookingCancellation(bookingId) {
  const request = await MaterialRequest.findOne({ bookingId });
  if (!request) return null; // no material request exists (e.g. laundry booking) — nothing to do
  if (request.status === 'cancelled') return request; // already handled — avoid double stock restoration

  if (request.status === 'pending') {
    request.status = 'cancelled';
    await request.save();
    return request;
  }

  if (request.status === 'confirmed') {
    for (const item of request.items) {
      await InventoryItem.incrementQuantity(item.sku, item.qtyRequested);
    }
    request.status = 'cancelled';
    request.cancelledAfterConfirmation = true;
    await request.save();
    return request;
  }

  return request;
}

module.exports = { generateMaterialRequest, confirmMaterialRequest, handleBookingCancellation };
