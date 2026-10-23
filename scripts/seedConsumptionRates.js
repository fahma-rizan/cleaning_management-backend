/**
 * Seeds the `consumptionrates` collection — how much of each consumable a
 * service uses per unit of its consumption factor. Feeds the (future)
 * auto-generation of a MaterialRequest when a booking is made.
 *
 * Command: node scripts/seedConsumptionRates.js   (from the backend root)
 *
 * serviceIds are NEVER hardcoded here — every entry below is resolved by
 * matching `serviceName` against the live `services` collection at runtime.
 * If an expected service is missing, that entry is skipped and reported
 * rather than guessed.
 *
 * House Deep Cleaning and Commercial Cleaning each have only ONE row in
 * `services` (serviceId 1 and 5), but 3 rate profiles — matching the
 * 'normal' | 'move-in-out' | 'after-construction' ids already used in
 * `pricelists.pricing.types[].id` for those two services. ConsumptionRate
 * distinguishes them with a `variant` field; every other service leaves
 * `variant` null.
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/db');
const Service = require('../models/Service');
const InventoryItem = require('../models/InventoryItem');
const ConsumptionRate = require('../models/ConsumptionRate');

// ─── Rate data ──────────────────────────────────────────────────────────────
// Each entry is matched to a `services` document by exact `serviceName`.
const RATE_ENTRIES = [
  {
    serviceName: 'House Deep Cleaning', variant: 'normal', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'GEN-001', qtyPerUnit: 0.5 }, { sku: 'GEN-002', qtyPerUnit: 0.3 },
      { sku: 'GEN-003', qtyPerUnit: 0.2 }, { sku: 'GEN-004', qtyPerUnit: 0.4 },
      { sku: 'BTH-001', qtyPerUnit: 0.2 }, { sku: 'BTH-003', qtyPerUnit: 0.15 },
    ],
    fixedItems: [
      { sku: 'BTH-002', qty: 0.1 }, { sku: 'DIS-001', qty: 1 }, { sku: 'DIS-002', qty: 1 },
      { sku: 'DIS-003', qty: 2 }, { sku: 'DIS-004', qty: 1 }, { sku: 'STO-003', qty: 1 },
    ],
  },
  {
    serviceName: 'House Deep Cleaning', variant: 'move-in-out', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'GEN-001', qtyPerUnit: 0.9 }, { sku: 'GEN-002', qtyPerUnit: 0.4 },
      { sku: 'GEN-003', qtyPerUnit: 0.3 }, { sku: 'GEN-004', qtyPerUnit: 0.6 },
      { sku: 'BTH-001', qtyPerUnit: 0.3 }, { sku: 'BTH-003', qtyPerUnit: 0.2 },
    ],
    fixedItems: [
      { sku: 'DIS-001', qty: 2 }, { sku: 'DIS-002', qty: 1 }, { sku: 'DIS-003', qty: 2 },
      { sku: 'DIS-004', qty: 1 }, { sku: 'STO-003', qty: 1 },
    ],
  },
  {
    serviceName: 'House Deep Cleaning', variant: 'after-construction', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'CON-001', qtyPerUnit: 0.6 }, { sku: 'CON-002', qtyPerUnit: 0.4 },
      { sku: 'GEN-003', qtyPerUnit: 0.4 }, { sku: 'GEN-004', qtyPerUnit: 0.8 },
      { sku: 'BTH-003', qtyPerUnit: 0.2 },
    ],
    fixedItems: [
      { sku: 'DIS-001', qty: 3 }, { sku: 'DIS-002', qty: 1 }, { sku: 'DIS-003', qty: 2 }, { sku: 'DIS-004', qty: 1 },
    ],
  },
  {
    serviceName: 'Commercial Cleaning', variant: 'normal', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'GEN-001', qtyPerUnit: 0.5 }, { sku: 'GEN-002', qtyPerUnit: 0.3 },
      { sku: 'GEN-003', qtyPerUnit: 0.2 }, { sku: 'GEN-004', qtyPerUnit: 0.4 },
      { sku: 'BTH-001', qtyPerUnit: 0.2 }, { sku: 'BTH-003', qtyPerUnit: 0.15 },
    ],
    fixedItems: [
      { sku: 'DIS-001', qty: 1 }, { sku: 'DIS-002', qty: 1 }, { sku: 'DIS-003', qty: 2 },
      { sku: 'DIS-004', qty: 1 }, { sku: 'STO-003', qty: 1 },
    ],
  },
  {
    serviceName: 'Commercial Cleaning', variant: 'move-in-out', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'GEN-001', qtyPerUnit: 0.7 }, { sku: 'GEN-002', qtyPerUnit: 0.4 },
      { sku: 'GEN-003', qtyPerUnit: 0.3 }, { sku: 'GEN-004', qtyPerUnit: 0.6 },
      { sku: 'BTH-001', qtyPerUnit: 0.2 }, { sku: 'BTH-003', qtyPerUnit: 0.2 },
    ],
    fixedItems: [
      { sku: 'DIS-001', qty: 2 }, { sku: 'DIS-002', qty: 1 }, { sku: 'DIS-003', qty: 2 }, { sku: 'DIS-004', qty: 1 },
    ],
  },
  {
    serviceName: 'Commercial Cleaning', variant: 'after-construction', unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'CON-001', qtyPerUnit: 0.6 }, { sku: 'CON-002', qtyPerUnit: 0.4 },
      { sku: 'GEN-003', qtyPerUnit: 0.4 }, { sku: 'GEN-004', qtyPerUnit: 0.8 },
      { sku: 'BTH-003', qtyPerUnit: 0.2 },
    ],
    fixedItems: [
      { sku: 'DIS-001', qty: 3 }, { sku: 'DIS-002', qty: 1 }, { sku: 'DIS-003', qty: 2 }, { sku: 'DIS-004', qty: 1 },
    ],
  },
  {
    serviceName: 'General Cleaning', variant: null, unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'GEN-001', qtyPerUnit: 0.3 }, { sku: 'GEN-004', qtyPerUnit: 0.3 }, { sku: 'GEN-005', qtyPerUnit: 0.15 },
    ],
    fixedItems: [{ sku: 'DIS-001', qty: 1 }],
  },
  {
    serviceName: 'Floor Cleaning', variant: null, unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'FLR-001', qtyPerUnit: 0.4 }, { sku: 'FLR-002', qtyPerUnit: 0.1 },
      { sku: 'FLR-003', qtyPerUnit: 0.3 }, { sku: 'FLR-004', qtyPerUnit: 0.05 },
      { sku: 'FLR-005', qtyPerUnit: 0.3 }, { sku: 'FLR-006', qtyPerUnit: 0.1 }, { sku: 'FLR-007', qtyPerUnit: 0.05 },
    ],
    fixedItems: [{ sku: 'DIS-003', qty: 2 }],
  },
  {
    serviceName: 'Floor - Cut and Polish', variant: null, unitBasis: 'per_100_sqft',
    scalingItems: [{ sku: 'FLR-008', qtyPerUnit: 0.2 }, { sku: 'FLR-009', qtyPerUnit: 0.15 }],
    fixedItems: [],
  },
  {
    serviceName: 'Sofa Cleaning', variant: null, unitBasis: 'per_seat',
    scalingItems: [
      { sku: 'UPH-001', qtyPerUnit: 0.15 }, { sku: 'STO-001', qtyPerUnit: 0.05 }, { sku: 'STO-002', qtyPerUnit: 0.03 },
    ],
    fixedItems: [{ sku: 'DIS-002', qty: 1 }],
  },
  {
    serviceName: 'Mattress Cleaning', variant: null, unitBasis: 'per_mattress',
    scalingItems: [],
    fixedItems: [{ sku: 'DIS-003', qty: 1 }],
    sizeVariants: [
      { size: 'king',   items: [{ sku: 'UPH-004', qty: 0.30 }, { sku: 'STO-004', qty: 0.10 }], topOnlyMultiplier: 0.5 },
      { size: 'queen',  items: [{ sku: 'UPH-004', qty: 0.25 }, { sku: 'STO-004', qty: 0.08 }], topOnlyMultiplier: 0.5 },
      { size: 'double', items: [{ sku: 'UPH-004', qty: 0.20 }, { sku: 'STO-004', qty: 0.07 }], topOnlyMultiplier: 0.5 },
      { size: 'single', items: [{ sku: 'UPH-004', qty: 0.15 }, { sku: 'STO-004', qty: 0.05 }], topOnlyMultiplier: 0.5 },
    ],
  },
  {
    serviceName: 'Carpet Cleaning', variant: null, unitBasis: 'per_100_sqft',
    scalingItems: [
      { sku: 'UPH-002', qtyPerUnit: 0.4 }, { sku: 'UPH-003', qtyPerUnit: 0.1 }, { sku: 'STO-002', qtyPerUnit: 0.05 },
    ],
    fixedItems: [],
  },
  {
    serviceName: 'Curtain Cleaning', variant: null, unitBasis: 'per_curtain',
    scalingItems: [
      { sku: 'FAB-001', qtyPerUnit: 0.2 }, { sku: 'FAB-002', qtyPerUnit: 0.1 }, { sku: 'FAB-003', qtyPerUnit: 0.05 },
      { sku: 'STO-001', qtyPerUnit: 0.05 }, { sku: 'FAB-004', qtyPerUnit: 0.05 },
    ],
    fixedItems: [],
  },
  // Laundry group — no consumables. Seeded with unitBasis 'none' + empty
  // arrays so material-request generation has an explicit document to check
  // against, rather than inferring "no rate" from a missing document.
  { serviceName: 'Dry Cleaning',        variant: null, unitBasis: 'none', scalingItems: [], fixedItems: [] },
  { serviceName: 'Washing & Pressing',  variant: null, unitBasis: 'none', scalingItems: [], fixedItems: [] },
  { serviceName: 'Pressing Only',       variant: null, unitBasis: 'none', scalingItems: [], fixedItems: [] },
];

async function run() {
  await connectDB();

  // ── Resolve serviceIds from the live `services` collection ──────────────
  const neededNames = [...new Set(RATE_ENTRIES.map(e => e.serviceName))];
  const services = await Service.find({ name: { $in: neededNames } }).select('serviceId name').lean();
  const serviceByName = new Map(services.map(s => [s.name, s.serviceId]));

  const missingNames = neededNames.filter(n => !serviceByName.has(n));
  if (missingNames.length) {
    console.warn('⚠️  Missing from `services` collection (entries referencing these are skipped):');
    missingNames.forEach(n => console.warn(`   - ${n}`));
  }

  // ── Validate referenced SKUs against the live `inventoryitems` collection ──
  const allSkus = [...new Set(
    RATE_ENTRIES.flatMap(e => [
      ...(e.scalingItems || []).map(i => i.sku),
      ...(e.fixedItems || []).map(i => i.sku),
      ...(e.sizeVariants || []).flatMap(v => v.items.map(i => i.sku)),
    ])
  )];
  const foundItems = await InventoryItem.find({ sku: { $in: allSkus } }).select('sku').lean();
  const foundSkus = new Set(foundItems.map(i => i.sku));
  const missingSkus = allSkus.filter(s => !foundSkus.has(s));
  if (missingSkus.length) {
    console.warn('⚠️  SKUs referenced below are missing from `inventoryitems` (entries using them are skipped):');
    missingSkus.forEach(s => console.warn(`   - ${s}`));
  }

  // ── Build the documents to insert ────────────────────────────────────────
  const skipped = [];
  const docs = [];
  for (const entry of RATE_ENTRIES) {
    const serviceId = serviceByName.get(entry.serviceName);
    if (serviceId === undefined) {
      skipped.push(`${entry.serviceName}${entry.variant ? ` (${entry.variant})` : ''} — no matching service`);
      continue;
    }
    const usedSkus = [
      ...(entry.scalingItems || []).map(i => i.sku),
      ...(entry.fixedItems || []).map(i => i.sku),
      ...(entry.sizeVariants || []).flatMap(v => v.items.map(i => i.sku)),
    ];
    const badSku = usedSkus.find(s => !foundSkus.has(s));
    if (badSku) {
      skipped.push(`${entry.serviceName}${entry.variant ? ` (${entry.variant})` : ''} — references missing SKU ${badSku}`);
      continue;
    }

    docs.push({
      serviceId,
      variant: entry.variant,
      serviceName: entry.serviceName,
      unitBasis: entry.unitBasis,
      scalingItems: entry.scalingItems || [],
      fixedItems: entry.fixedItems || [],
      sizeVariants: entry.sizeVariants || [],
    });
  }

  // ── Clear + insert (idempotent: always ends in the same known state) ────
  const existingCount = await ConsumptionRate.countDocuments();
  if (existingCount > 0) {
    console.log(`ℹ️  ${existingCount} existing document(s) in consumptionrates — clearing before reseed.`);
  }
  await ConsumptionRate.deleteMany({});

  const inserted = docs.length ? await ConsumptionRate.insertMany(docs) : [];

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n✅ Inserted ${inserted.length} of ${RATE_ENTRIES.length} consumption rate document(s).\n`);

  console.log('serviceId  variant              items  serviceName');
  console.log('---------  -------------------  -----  -----------');
  inserted
    .sort((a, b) => a.serviceId - b.serviceId || (a.variant || '').localeCompare(b.variant || ''))
    .forEach(d => {
      const itemCount = d.scalingItems.length + d.fixedItems.length
        + d.sizeVariants.reduce((n, v) => n + v.items.length, 0);
      console.log(
        `${String(d.serviceId).padEnd(9)}  ${(d.variant || '—').padEnd(19)}  ${String(itemCount).padEnd(5)}  ${d.serviceName}`
      );
    });

  if (skipped.length) {
    console.log('\n⚠️  Skipped (not inserted):');
    skipped.forEach(s => console.log(`   - ${s}`));
  }

  await require('mongoose').disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
