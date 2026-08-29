require('dotenv').config({ path: __dirname + '/../.env' });
const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const bookingId = process.argv[2] || 'BK-1776787534782';
    const booking = await db.collection('bookings').findOne({ bookingId });
    console.log('Found booking:', booking);
  } catch (err) {
    console.error('Inspect failed:', err.message);
  } finally {
    await client.close();
  }
})();
