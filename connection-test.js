/**
 * CONNECTION TEST SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this after migration to verify Atlas connection and collection health.
 *
 * Usage:
 *   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname node connection-test.js
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ Set MONGO_URI environment variable first.');
  console.error('   Example: MONGO_URI=mongodb+srv://... node connection-test.js');
  process.exit(1);
}

const EXPECTED_COLLECTIONS = [
  'users', 'bookings', 'invoices', 'notifications',
  'refunds', 'paymentreminders',
  'loyaltyaccounts', 'loyaltytransactions',
  'offers', 'pricelists', 'services',
  'otptokens', 'refreshtokens',
  'inventoryitems', 'inventorytransactions',
  'equipments', 'bottles', 'bottleinstances',
  'materialrequests', 'completionreports', 'stocklogs',
  'lowstockalerts', 'consumptionrates',
  'gpslocations', 'settings', 'reviews', 'counters',
];

async function run() {
  console.log('🔌 Connecting to Atlas...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name.toLowerCase());

  console.log('── Collections found ──────────────────────────────────────');
  for (const name of collectionNames) {
    const count = await db.collection(name).countDocuments();
    console.log(`  ${name.padEnd(30)} ${count} documents`);
  }

  console.log('\n── Checking expected collections ──────────────────────────');
  let missingCount = 0;
  for (const expected of EXPECTED_COLLECTIONS) {
    if (collectionNames.includes(expected)) {
      console.log(`  ✅ ${expected}`);
    } else {
      console.log(`  ⚠️  ${expected} — not found (may not exist yet)`);
      missingCount++;
    }
  }

  console.log('\n── Checking critical field types ──────────────────────────');

  // Check Notification.userId is ObjectId
  const notiStringUser = await db.collection('notifications').countDocuments({
    userId: { $type: 'string' }
  });
  console.log(notiStringUser === 0
    ? '  ✅ notifications.userId — all ObjectId'
    : `  ❌ notifications.userId — ${notiStringUser} still String (run migration.js)`);

  // Check Invoice.bookingId is ObjectId
  const invStringBooking = await db.collection('invoices').countDocuments({
    bookingId: { $type: 'string' }
  });
  console.log(invStringBooking === 0
    ? '  ✅ invoices.bookingId — all ObjectId'
    : `  ❌ invoices.bookingId — ${invStringBooking} still String (run migration.js)`);

  // Check Booking status normalised
  const uppercaseStatus = await db.collection('bookings').countDocuments({
    status: { $in: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'ADVANCE_PAID'] }
  });
  console.log(uppercaseStatus === 0
    ? '  ✅ bookings.status — all lowercase'
    : `  ❌ bookings.status — ${uppercaseStatus} still uppercase (run migration.js)`);

  // Check customerId field (not userId/user)
  const bookingOldUserField = await db.collection('bookings').countDocuments({
    $or: [{ user: { $exists: true } }, { userId: { $exists: true } }]
  });
  console.log(bookingOldUserField === 0
    ? '  ✅ bookings.customerId — field name correct'
    : `  ❌ bookings — ${bookingOldUserField} docs still have 'user' or 'userId' (run migration.js)`);

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(missingCount === 0
    ? '🎉 All checks passed! Database looks healthy.'
    : `⚠️  ${missingCount} expected collections not yet present.`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});