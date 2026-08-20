/**
 * MIGRATION SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this ONCE on each member's old database to normalise data
 * before pointing everything at the shared Atlas cluster.
 *
 * Usage:
 *   1. Set MONGO_URI to the OLD (individual) database URI
 *   2. Run: node migration.js
 *   3. Repeat for each member's database (change MONGO_URI each time)
 *
 * What it does:
 *   - Renames field clashes in Users, Bookings, Notifications
 *   - Converts String ObjectId references to actual ObjectIds
 *   - Normalises status enums to lowercase
 *   - Adds missing default fields
 */

const mongoose = require('mongoose');

// ─── CONFIG — change this per member ──────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/YOUR_DB_NAME';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to:', MONGO_URI);

  const db = mongoose.connection.db;

  // ── 1. USERS ────────────────────────────────────────────────────────────────
  console.log('\n── Migrating users collection ──');

  // verified → isVerified
  const verifiedResult = await db.collection('users').updateMany(
    { verified: { $exists: true }, isVerified: { $exists: false } },
    [{ $set: { isVerified: '$verified' } }]
  );
  await db.collection('users').updateMany({}, { $unset: { verified: '' } });
  console.log(`  verified → isVerified: ${verifiedResult.modifiedCount} docs`);

  // requiresPasswordChange stays (already consistent in most)
  // mustChangePassword → requiresPasswordChange
  const mustChangeResult = await db.collection('users').updateMany(
    { mustChangePassword: { $exists: true }, requiresPasswordChange: { $exists: false } },
    [{ $set: { requiresPasswordChange: '$mustChangePassword' } }]
  );
  await db.collection('users').updateMany({}, { $unset: { mustChangePassword: '' } });
  console.log(`  mustChangePassword → requiresPasswordChange: ${mustChangeResult.modifiedCount} docs`);

  // profileImage → profilePhoto
  const profileResult = await db.collection('users').updateMany(
    { profileImage: { $exists: true }, profilePhoto: { $exists: false } },
    [{ $set: { profilePhoto: '$profileImage' } }]
  );
  await db.collection('users').updateMany({}, { $unset: { profileImage: '' } });
  console.log(`  profileImage → profilePhoto: ${profileResult.modifiedCount} docs`);

  // Add isActive:true for users that don't have it
  const isActiveResult = await db.collection('users').updateMany(
    { isActive: { $exists: false } },
    { $set: { isActive: true } }
  );
  console.log(`  added isActive=true: ${isActiveResult.modifiedCount} docs`);

  // Split name → firstName + lastName for users that only have 'name'
  const usersWithName = await db.collection('users').find({
    name: { $exists: true },
    firstName: { $exists: false }
  }).toArray();
  let nameSplitCount = 0;
  for (const u of usersWithName) {
    const parts = (u.name || '').trim().split(/\s+/);
    const firstName = parts[0] || u.name;
    const lastName  = parts.slice(1).join(' ') || parts[0] || '';
    await db.collection('users').updateOne(
      { _id: u._id },
      { $set: { firstName, lastName } }
    );
    nameSplitCount++;
  }
  console.log(`  name → firstName+lastName: ${nameSplitCount} docs`);

  // ── 2. BOOKINGS ─────────────────────────────────────────────────────────────
  console.log('\n── Migrating bookings collection ──');

  // user → customerId (ObjectId field rename)
  const userRefResult = await db.collection('bookings').updateMany(
    { user: { $exists: true }, customerId: { $exists: false } },
    [{ $set: { customerId: '$user' } }]
  );
  await db.collection('bookings').updateMany({}, { $unset: { user: '' } });
  console.log(`  user → customerId: ${userRefResult.modifiedCount} docs`);

  // userId → customerId
  const userIdResult = await db.collection('bookings').updateMany(
    { userId: { $exists: true }, customerId: { $exists: false } },
    [{ $set: { customerId: '$userId' } }]
  );
  await db.collection('bookings').updateMany({}, { $unset: { userId: '' } });
  console.log(`  userId → customerId: ${userIdResult.modifiedCount} docs`);

  // bookingRef → bookingId
  const bookingRefResult = await db.collection('bookings').updateMany(
    { bookingRef: { $exists: true }, bookingId: { $exists: false } },
    [{ $set: { bookingId: '$bookingRef' } }]
  );
  await db.collection('bookings').updateMany({}, { $unset: { bookingRef: '' } });
  console.log(`  bookingRef → bookingId: ${bookingRefResult.modifiedCount} docs`);

  // totalAmount → price
  const totalAmountResult = await db.collection('bookings').updateMany(
    { totalAmount: { $exists: true }, price: { $exists: false } },
    [{ $set: { price: '$totalAmount' } }]
  );
  await db.collection('bookings').updateMany({}, { $unset: { totalAmount: '' } });
  console.log(`  totalAmount → price: ${totalAmountResult.modifiedCount} docs`);

  // assignedCleaner → assignedStaffId
  const cleanerResult = await db.collection('bookings').updateMany(
    { assignedCleaner: { $exists: true }, assignedStaffId: { $exists: false } },
    [{ $set: { assignedStaffId: '$assignedCleaner' } }]
  );
  await db.collection('bookings').updateMany({}, { $unset: { assignedCleaner: '' } });
  console.log(`  assignedCleaner → assignedStaffId: ${cleanerResult.modifiedCount} docs`);

  // Normalise status to lowercase
  const statusMap = {
    'PENDING':       'pending',
    'CONFIRMED':     'confirmed',
    'CANCELLED':     'cancelled',
    'COMPLETED':     'completed',
    'ADVANCE_PAID':  'confirmed',
    'processing':    'in-progress',
    'confirmed-paid':    'confirmed',
    'confirmed-partial': 'confirmed',
    'confirmed-unpaid':  'confirmed',
  };
  let statusCount = 0;
  for (const [old, neo] of Object.entries(statusMap)) {
    const r = await db.collection('bookings').updateMany(
      { status: old },
      { $set: { status: neo } }
    );
    statusCount += r.modifiedCount;
  }
  console.log(`  normalised status enum: ${statusCount} docs`);

  // Normalise paymentMethod to lowercase
  const pmMap = { 'ONLINE': 'online', 'CASH': 'cash', 'NOT_PAID': 'pending', 'card': 'card' };
  for (const [old, neo] of Object.entries(pmMap)) {
    await db.collection('bookings').updateMany({ paymentMethod: old }, { $set: { paymentMethod: neo } });
  }
  console.log(`  normalised paymentMethod enum`);

  // ── 3. NOTIFICATIONS ────────────────────────────────────────────────────────
  console.log('\n── Migrating notifications collection ──');

  // Convert String userId → ObjectId where possible
  const notifsWithStringUser = await db.collection('notifications').find({
    userId: { $type: 'string' }
  }).toArray();
  let notiConvCount = 0;
  for (const n of notifsWithStringUser) {
    try {
      const oid = new mongoose.Types.ObjectId(n.userId);
      await db.collection('notifications').updateOne(
        { _id: n._id },
        { $set: { userId: oid } }
      );
      notiConvCount++;
    } catch (_) {
      // skip non-ObjectId strings
    }
  }
  console.log(`  userId String → ObjectId: ${notiConvCount} docs`);

  // user → userId
  const notiUserResult = await db.collection('notifications').updateMany(
    { user: { $exists: true }, userId: { $exists: false } },
    [{ $set: { userId: '$user' } }]
  );
  await db.collection('notifications').updateMany({}, { $unset: { user: '' } });
  console.log(`  user → userId: ${notiUserResult.modifiedCount} docs`);

  // Convert String bookingId → ObjectId
  const notifsWithStringBooking = await db.collection('notifications').find({
    bookingId: { $type: 'string' }
  }).toArray();
  let notiBookingConvCount = 0;
  for (const n of notifsWithStringBooking) {
    try {
      const oid = new mongoose.Types.ObjectId(n.bookingId);
      await db.collection('notifications').updateOne(
        { _id: n._id },
        { $set: { bookingId: oid } }
      );
      notiBookingConvCount++;
    } catch (_) {}
  }
  console.log(`  bookingId String → ObjectId: ${notiBookingConvCount} docs`);

  // ── 4. INVOICES ─────────────────────────────────────────────────────────────
  console.log('\n── Migrating invoices collection ──');

  // Convert customer.userId String → ObjectId
  const invoicesStringUserId = await db.collection('invoices').find({
    'customer.userId': { $type: 'string' }
  }).toArray();
  let invUserCount = 0;
  for (const inv of invoicesStringUserId) {
    try {
      const oid = new mongoose.Types.ObjectId(inv.customer.userId);
      await db.collection('invoices').updateOne(
        { _id: inv._id },
        { $set: { 'customer.userId': oid } }
      );
      invUserCount++;
    } catch (_) {}
  }
  console.log(`  customer.userId String → ObjectId: ${invUserCount} docs`);

  // Convert bookingId String → ObjectId
  const invoicesStringBooking = await db.collection('invoices').find({
    bookingId: { $type: 'string' }
  }).toArray();
  let invBookingCount = 0;
  for (const inv of invoicesStringBooking) {
    try {
      const oid = new mongoose.Types.ObjectId(inv.bookingId);
      await db.collection('invoices').updateOne(
        { _id: inv._id },
        { $set: { bookingId: oid } }
      );
      invBookingCount++;
    } catch (_) {}
  }
  console.log(`  bookingId String → ObjectId: ${invBookingCount} docs`);

  // ── 5. PAYMENT REMINDERS ────────────────────────────────────────────────────
  console.log('\n── Migrating paymentreminders collection ──');
  const prStringUser = await db.collection('paymentreminders').find({
    customerId: { $type: 'string' }
  }).toArray();
  let prCount = 0;
  for (const pr of prStringUser) {
    try {
      const oid = new mongoose.Types.ObjectId(pr.customerId);
      await db.collection('paymentreminders').updateOne(
        { _id: pr._id },
        { $set: { customerId: oid } }
      );
      prCount++;
    } catch (_) {}
  }
  console.log(`  customerId String → ObjectId: ${prCount} docs`);

  console.log('\n✅ Migration complete!');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
