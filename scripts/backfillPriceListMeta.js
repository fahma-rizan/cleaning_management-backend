// One-time backfill: seed.js originally pushed price lists as bare
// { serviceId, pricing } objects, with no serviceName/category/pricingType.
// The admin Pricing tab groups services by `category` and picks a renderer
// by `pricingType` — without those fields every seeded service is invisible
// (falls into no category, matching nothing in the UI's category filter).
// This adds the missing fields to the 3 originally-seeded services only;
// it does not touch anything created afterwards through the "Add Service"
// UI, since those already save the full record (see settingsController.js
// createService).
//
// Run once from the backend folder:
//   node scripts/backfillPriceListMeta.js

require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('../models/Settings');

const META = {
  9:  { serviceName: 'Dry Cleaning',          category: 'laundry', pricingType: 'per-item' },
  11: { serviceName: 'Pressing',              category: 'laundry', pricingType: 'per-item' },
  10: { serviceName: 'Washing & Pressing',    category: 'laundry', pricingType: 'per-item' },
};

async function run() {
  // Was process.env.MONGO_URI — this app's actual connection env var
  // (backend/config/db.js) is MONGODB_URI. MONGO_URI doesn't exist in
  // .env, so this either failed outright or connected somewhere other
  // than the real database — either way, nothing in the live Settings
  // document actually got updated.
  await mongoose.connect(process.env.MONGODB_URI);
  const settings = await Settings.getSingleton();

  let changed = 0;
  settings.priceLists.forEach((svc) => {
    const meta = META[svc.serviceId];
    if (!meta) return; // leave anything else untouched
    if (svc.serviceName && svc.category && svc.pricingType) return; // already has it
    Object.assign(svc, meta);
    changed++;
  });

  if (changed > 0) {
    settings.markModified('priceLists');
    await settings.save();
  }

  console.log(`Backfilled ${changed} service(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});