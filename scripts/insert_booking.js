require('dotenv').config({ path: __dirname + '/../.env' });
const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  // Prefer the SRV/modern connection string if available
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in backend/.env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();

    const bookingId = process.argv[2] || 'BK-1776787534782';

    const existing = await db.collection('bookings').findOne({ bookingId });
    if (existing) {
      console.log('Booking already exists:', existing._id.toString());
      process.exit(0);
    }

    const customerId = new ObjectId();

    const doc = {
      bookingId,
      customerId,
      customerName: 'Test Customer',
      customerEmail: 'test-customer@seed.local',
      serviceName: 'Home Deep Cleaning',
      serviceType: 'Home/Office Cleaning',
      serviceCategory: 'House Deep Cleaning',
      date: '2026-06-25',
      time: '10:00AM',
      address: '123 Test St, Colombo',
      price: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      status: 'pending',
      paymentMethod: 'online',
      paymentStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await db.collection('bookings').insertOne(doc);
    console.log('Inserted booking _id:', res.insertedId.toString());
  } catch (err) {
    console.error('Insert failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
