/**
 * SEED TEST DATA SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates one complete test record across all major collections.
 * Use this to verify cross-collection references work correctly.
 *
 * Usage:
 *   MONGO_URI=mongodb+srv://... node seed-test-data.js
 *
 * To clean up test data afterwards:
 *   MONGO_URI=mongodb+srv://... CLEANUP=true node seed-test-data.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const CLEANUP   = process.env.CLEANUP === 'true';

if (!MONGO_URI) {
  console.error('❌ Set MONGO_URI or MONGODB_URI environment variable first.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  if (CLEANUP) {
    console.log('🧹 Cleaning up test data...');
    await db.collection('users').deleteMany({ email: 'test-customer@seed.local' });
    await db.collection('users').deleteMany({ email: 'test-staff@seed.local' });
    await db.collection('bookings').deleteMany({ bookingId: 'BK-SEED-TEST-001' });
    await db.collection('invoices').deleteMany({ invoiceNumber: 'INV-SEED-TEST-001' });
    await db.collection('notifications').deleteMany({ type: 'seed-test' });
    console.log('✅ Cleanup done');
    await mongoose.disconnect();
    return;
  }

  // 1. Create test customer
  const customer = await db.collection('users').insertOne({
    firstName:   'Seed',
    lastName:    'Customer',
    name:        'Seed Customer',
    email:       'test-customer@seed.local',
    password:    '$2a$10$abc123hashedpassword',
    role:        'customer',
    isVerified:  true,
    isActive:    true,
    requiresPasswordChange: false,
    loyaltyPoints: 0,
    createdAt:   new Date(),
    updatedAt:   new Date(),
  });
  console.log('✅ Created test customer:', customer.insertedId);

  // 2. Create test staff
  const staff = await db.collection('users').insertOne({
    firstName:       'Seed',
    lastName:        'Staff',
    name:            'Seed Staff',
    email:           'test-staff@seed.local',
    password:        '$2a$10$abc123hashedpassword',
    role:            'staff',
    isVerified:      true,
    isActive:        true,
    requiresPasswordChange: false,
    specializations: ['Home Cleaning'],
    nic:             '123456789V',
    isAvailable:     true,
    createdAt:       new Date(),
    updatedAt:       new Date(),
  });
  console.log('✅ Created test staff:', staff.insertedId);

  // 3. Create test booking
  const booking = await db.collection('bookings').insertOne({
    bookingId:      'BK-SEED-TEST-001',
    customerId:     customer.insertedId,
    customerName:   'Seed Customer',
    customerEmail:  'test-customer@seed.local',
    serviceName:    'Home Deep Cleaning (SEED TEST)',
    serviceType:    'Home/Office Cleaning',
    serviceCategory:'House Deep Cleaning',
    date:           '2026-01-01',
    time:           '9:00AM - 11:00AM',
    address:        '123 Test Street, Colombo',
    price:          5000,
    paidAmount:     2500,
    balanceAmount:  2500,
    status:         'confirmed',
    paymentMethod:  'cash',
    paymentStatus:  'partial',
    assignedStaffId:   staff.insertedId,
    assignedStaffName: 'Seed Staff',
    needsAdminAttention: false,
    createdAt:      new Date(),
    updatedAt:      new Date(),
  });
  console.log('✅ Created test booking:', booking.insertedId);

  // 4. Create test invoice
  const invoice = await db.collection('invoices').insertOne({
    invoiceNumber:  'INV-SEED-TEST-001',
    invoiceType:    'ADVANCE',
    status:         'PARTIAL',
    customer: {
      userId:  customer.insertedId,
      name:    'Seed Customer',
      email:   'test-customer@seed.local',
      phone:   '0712345678',
      address: '123 Test Street, Colombo',
    },
    bookingId:      booking.insertedId,
    serviceItems:   [{ name: 'Home Deep Cleaning', price: 5000, quantity: 1 }],
    subTotal:       5000,
    totalAmount:    5000,
    paidAmount:     2500,
    balanceAmount:  2500,
    taxAmount:      0,
    discounts:      [],
    mainCategories: ['HOC'],
    history: [{
      event:     'invoice_created',
      timestamp: new Date(),
      details:   'Seed test invoice',
    }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('✅ Created test invoice:', invoice.insertedId);

  // 5. Create test notification
  const notif = await db.collection('notifications').insertOne({
    userId:    customer.insertedId,
    type:      'seed-test',
    title:     'Booking Confirmed',
    message:   'Your seed test booking BK-SEED-TEST-001 is confirmed.',
    read:      false,
    bookingId: booking.insertedId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('✅ Created test notification:', notif.insertedId);

  // 6. Verify cross-collection joins work
  console.log('\n── Verifying references ──────────────────────────────────');

  const foundBooking = await db.collection('bookings').findOne({ bookingId: 'BK-SEED-TEST-001' });
  const foundCustomer = await db.collection('users').findOne({ _id: foundBooking.customerId });
  console.log(`  Booking → Customer: ${foundCustomer ? '✅ ' + foundCustomer.email : '❌ NOT FOUND'}`);

  const foundInvoice = await db.collection('invoices').findOne({ invoiceNumber: 'INV-SEED-TEST-001' });
  const foundBookingFromInv = await db.collection('bookings').findOne({ _id: foundInvoice.bookingId });
  console.log(`  Invoice → Booking: ${foundBookingFromInv ? '✅ ' + foundBookingFromInv.bookingId : '❌ NOT FOUND'}`);

  const foundNotif = await db.collection('notifications').findOne({ type: 'seed-test' });
  const foundUserFromNotif = await db.collection('users').findOne({ _id: foundNotif.userId });
  console.log(`  Notification → User: ${foundUserFromNotif ? '✅ ' + foundUserFromNotif.email : '❌ NOT FOUND'}`);

  console.log('\n🎉 Seed test complete! Run with CLEANUP=true to remove test data.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});