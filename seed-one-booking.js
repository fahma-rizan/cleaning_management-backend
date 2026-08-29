const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('MONGODB_URI / MONGO_URI not set in .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  // create customer if not exists
  const users = db.collection('users');
  let customer = await users.findOne({ email: 'seed-temp-customer@local' });
  if (!customer) {
    const res = await users.insertOne({
      firstName: 'SeedTemp',
      lastName: 'Customer',
      name: 'SeedTemp Customer',
      email: 'seed-temp-customer@local',
      password: 'seed',
      role: 'customer',
      isVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customer = await users.findOne({ _id: res.insertedId });
    console.log('Created customer', customer._id.toString());
  } else {
    console.log('Found existing customer', customer._id.toString());
  }

  // create booking with desired bookingId
  const bookings = db.collection('bookings');
  const bookingId = 'BK-1723894723984';
  let booking = await bookings.findOne({ bookingId });
  if (!booking) {
    const now = new Date();
    const res = await bookings.insertOne({
      bookingId,
      customerId: customer._id,
      customerName: customer.name,
      customerEmail: customer.email,
      serviceName: 'Seeded Test Service',
      serviceType: 'Home/Office Cleaning',
      serviceCategory: 'House Deep Cleaning',
      date: '2026-01-01',
      time: '9:00AM - 11:00AM',
      address: '123 Test Street',
      price: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      status: 'confirmed',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    booking = await bookings.findOne({ _id: res.insertedId });
    console.log('Created booking', booking.bookingId, booking._id.toString());
  } else {
    console.log('Booking already exists', booking.bookingId);
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
