// Seeds ALL 12 services (all 4 Pricing-tab categories) into the new
// backend's Settings.priceLists array.
//
// Source: frontend/src/data/SeedPriceList.js — the original, complete
// seed data (written for the OLD backend's standalone PriceList
// collection, which no longer exists in this codebase). This new
// backend's own backend/seed.js only ever ported 3 of these 12 services
// (Dry Cleaning, Washing & Pressing, Pressing) into Settings.priceLists —
// Home/Office Cleaning (5 services), Shampoo & Vacuum Cleaning (3
// services), and Curtain Cleaning (1 service) were never seeded here at
// all, which is why those 3 categories show "No services yet."
//
// Safe to re-run: upserts by serviceId (same pattern as backend/seed.js),
// so it won't create duplicates.
//
// Run once from the backend folder:
//   node scripts/seedAllPriceLists.js

require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('../models/Settings');

const priceLists = [
  // ─── Home & Office Cleaning ─────────────────────────────────────────────
  {
    serviceId: 1, serviceName: 'House Deep Cleaning', category: 'home', pricingType: 'per-sqft',
    pricing: { types: [
      { id: 'normal', label: 'Normal Deep Cleaning', pricePerSqft: 25 },
      { id: 'move-in-out', label: 'Move In / Move Out', pricePerSqft: 30 },
      { id: 'after-construction', label: 'After Construction', pricePerSqft: 35 },
    ]},
  },
  {
    serviceId: 6, serviceName: 'General Cleaning', category: 'home', pricingType: 'per-sqft',
    pricing: { types: [{ id: 'general', label: 'General Cleaning', pricePerSqft: 20 }] },
  },
  {
    serviceId: 5, serviceName: 'Commercial Cleaning', category: 'home', pricingType: 'per-sqft',
    pricing: { types: [
      { id: 'normal', label: 'Normal Deep Cleaning', pricePerSqft: 25 },
      { id: 'move-in-out', label: 'Move In / Move Out', pricePerSqft: 30 },
      { id: 'after-construction', label: 'After Construction', pricePerSqft: 35 },
    ]},
  },
  {
    serviceId: 7, serviceName: 'Floor Cleaning', category: 'home', pricingType: 'per-sqft',
    pricing: { types: [{ id: 'floor', label: 'Floor Cleaning', pricePerSqft: 30 }] },
  },
  {
    serviceId: 8, serviceName: 'Floor - Cut and Polish', category: 'home', pricingType: 'per-sqft',
    pricing: { types: [{ id: 'cut-polish', label: 'Cut & Polish', pricePerSqft: 35 }] },
  },

  // ─── Laundry Services ────────────────────────────────────────────────────
  {
    serviceId: 9, serviceName: 'Dry Cleaning', category: 'laundry', pricingType: 'per-item',
    pricing: { groups: [
      { label: 'Regular Clothing', items: [
        { name: 'Shirt', price: 400 }, { name: 'T-Shirt', price: 350 }, { name: 'Thobe', price: 550 },
        { name: 'Kurta', price: 500 }, { name: 'Trouser', price: 450 }, { name: 'Shorts', price: 400 },
      ]},
      { label: 'Formal Wear', items: [
        { name: 'Blazer', price: 700 }, { name: 'Two Piece Suit', price: 850 }, { name: 'Three Piece Suit', price: 1250 },
      ]},
      { label: "Women's Wear", items: [
        { name: 'Blouse', price: 300 }, { name: 'Dress (Short)', price: 500 }, { name: 'Dress (Long)', price: 600 },
        { name: 'Salwar (Top)', price: 500 }, { name: 'Salwar (Full Set)', price: 700 }, { name: 'Saree', price: 900 },
        { name: 'Special Work Saree', price: 1250 }, { name: 'Skirts', price: 450 }, { name: 'Special Work Salwar', price: 1250 },
      ]},
      { label: 'Traditional Wear', items: [{ name: 'Dhoti', price: 450 }] },
      { label: 'Special Occasion', items: [{ name: 'Bridal Dress / Lehenga', price: 3500 }] },
      { label: 'Winter Wear', items: [
        { name: 'Sweaters', price: 650 }, { name: 'Winter Jacket', price: 1000 }, { name: 'Shawl', price: 175 }, { name: 'Cloak', price: 500 },
      ]},
    ]},
  },
  {
    serviceId: 10, serviceName: 'Washing & Pressing', category: 'laundry', pricingType: 'per-item',
    pricing: { hasFoldHang: true, groups: [
      { label: 'Regular Clothing', items: [
        { name: 'Shirt', foldPrice: 270, hangPrice: 370 }, { name: 'T-Shirt', foldPrice: 220, hangPrice: 320 },
        { name: 'Thobe', foldPrice: 370, hangPrice: 470 }, { name: 'Kurta', foldPrice: 320, hangPrice: 420 },
        { name: 'Trouser', foldPrice: 320, hangPrice: 420 }, { name: 'Shorts', foldPrice: 270, hangPrice: 370 },
        { name: 'VSet', foldPrice: 170, hangPrice: 270 },
      ]},
      { label: "Women's Wear", items: [
        { name: 'Blouse', foldPrice: 270, hangPrice: 370 }, { name: 'Dress (Short)', foldPrice: 320, hangPrice: 420 },
        { name: 'Dress (Long)', foldPrice: 420, hangPrice: 520 }, { name: 'Salwar (Top)', foldPrice: 320, hangPrice: 420 },
        { name: 'Salwar (Full Set)', foldPrice: 420, hangPrice: 520 }, { name: 'Skirts', foldPrice: 320, hangPrice: 420 },
      ]},
      { label: 'Traditional Wear', items: [{ name: 'Sarong', foldPrice: 420, hangPrice: 520 }] },
      { label: 'Home Textiles', items: [
        { name: 'Pillowcases', price: 170, noFoldHang: true }, { name: 'Bedsheets', price: 350, noFoldHang: true },
        { name: 'Bathrobe', price: 650, noFoldHang: true },
      ]},
    ]},
  },
  {
    serviceId: 11, serviceName: 'Pressing Only', category: 'laundry', pricingType: 'per-item',
    pricing: { hasFoldHang: true, groups: [
      { label: 'Regular Clothing', items: [
        { name: 'Shirt', foldPrice: 175, hangPrice: 275 }, { name: 'T-Shirt', foldPrice: 125, hangPrice: 225 },
        { name: 'Thobe', foldPrice: 275, hangPrice: 375 }, { name: 'Kurta', foldPrice: 225, hangPrice: 325 },
        { name: 'Trouser', foldPrice: 225, hangPrice: 325 }, { name: 'Shorts', foldPrice: 175, hangPrice: 275 },
      ]},
      { label: "Women's Wear", items: [
        { name: 'Blouse', foldPrice: 175, hangPrice: 275 }, { name: 'Dress (Short)', foldPrice: 225, hangPrice: 325 },
        { name: 'Dress (Long)', foldPrice: 325, hangPrice: 425 }, { name: 'Salwar (Top)', foldPrice: 225, hangPrice: 325 },
        { name: 'Salwar (Full Set)', foldPrice: 325, hangPrice: 425 }, { name: 'Skirts', foldPrice: 225, hangPrice: 325 },
      ]},
      { label: 'Traditional Wear', items: [
        { name: 'Sarong', foldPrice: 325, hangPrice: 425 }, { name: 'Dhoti', price: 325, noFoldHang: true },
      ]},
      { label: 'Formal Wear', items: [
        { name: 'Blazer', price: 500, noFoldHang: true }, { name: 'Two Piece Suit', price: 750, noFoldHang: true },
        { name: 'Three Piece Suit', price: 900, noFoldHang: true },
      ]},
      { label: 'Special Wear', items: [
        { name: 'Saree', price: 600, noFoldHang: true }, { name: 'Special Work Saree', price: 850, noFoldHang: true },
        { name: 'Special Work Lehenga / Dresses', price: 720, noFoldHang: true }, { name: 'Cloaks', price: 400, noFoldHang: true },
      ]},
      { label: 'Home Textiles', items: [
        { name: 'Bed Sheet', price: 225, noFoldHang: true }, { name: 'Pillowcases', price: 125, noFoldHang: true },
      ]},
    ]},
  },

  // ─── Shampoo & Vacuum Cleaning ──────────────────────────────────────────
  {
    serviceId: 3, serviceName: 'Sofa Cleaning', category: 'shampoo', pricingType: 'per-seat',
    pricing: { seats: [
      { seats: 2, price: 2900 }, { seats: 3, price: 3900 }, { seats: 4, price: 4900 }, { seats: 5, price: 5900 },
    ]},
  },
  {
    serviceId: 13, serviceName: 'Mattress Cleaning', category: 'shampoo', pricingType: 'fixed',
    pricing: { sizes: [
      { label: 'King Size', options: [{ type: 'Full', price: 11500 }, { type: 'Top Only', price: 8500 }] },
      { label: 'Queen Size', options: [{ type: 'Full', price: 10500 }, { type: 'Top Only', price: 7500 }] },
      { label: 'Double Mattress', options: [{ type: 'Full', price: 10000 }, { type: 'Top Only', price: 7000 }] },
      { label: 'Single Mattress', options: [{ type: 'Full', price: 8000 }, { type: 'Top Only', price: 5500 }] },
    ]},
  },
  {
    serviceId: 14, serviceName: 'Carpet Cleaning', category: 'shampoo', pricingType: 'per-sqft',
    pricing: { types: [{ id: 'office-carpet', label: 'Office Carpet Cleaning', pricePerSqft: 35 }] },
  },

  // ─── Curtain Cleaning ────────────────────────────────────────────────────
  {
    serviceId: 4, serviceName: 'Curtain Cleaning', category: 'curtain', pricingType: 'per-unit',
    pricing: {
      types: [
        { id: 'dry-clean-press', label: 'Dry Cleaning & Pressing', pricePerCurtain: 2500 },
        { id: 'laundry-press', label: 'Laundry & Pressing', pricePerCurtain: 3500 },
        { id: 'premium', label: 'Curtain Premium Service', pricePerCurtain: 4500 },
      ],
      addons: [
        { id: 'removal', label: 'Curtain Removal', price: 100, perUnit: true },
        { id: 'installation', label: 'Curtain Installation', price: 100, perUnit: true },
        { id: 'delivery', label: 'Delivery', price: 500, perUnit: false },
      ],
    },
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const settings = await Settings.getSingleton();

  let added = 0, updated = 0;
  for (const svc of priceLists) {
    const idx = settings.priceLists.findIndex((p) => p.serviceId === svc.serviceId);
    if (idx >= 0) { settings.priceLists[idx] = svc; updated++; }
    else { settings.priceLists.push(svc); added++; }
  }

  settings.markModified('priceLists');
  await settings.save();

  console.log(`Added ${added}, updated ${updated}. Total services now: ${settings.priceLists.length}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});