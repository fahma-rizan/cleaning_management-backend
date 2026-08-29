const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

const BookingSchema = new mongoose.Schema({
  bookingId: String,
  customerId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerEmail: String,
  email: String,
  serviceName: String,
  serviceType: String,
  serviceItems: Array,
  date: String,
  time: String,
  address: String,
  price: Number,
  advanceAmount: Number,
  balanceAmount: Number,
  status: String,
  paymentMethod: String,
}, { timestamps: true });

const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

async function run() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    let bookings = await Booking.find().limit(10).lean();
    
    if (bookings.length === 0) {
      console.log('No bookings found. Creating a fresh test booking...');
      const newBooking = new Booking({
        bookingId: 'BK-' + Date.now(),
        customerName: 'Test Customer',
        customerEmail: 'customer@example.com',
        email: 'customer@example.com',
        serviceName: 'Deep Home Cleaning',
        serviceType: 'Home Cleaning',
        serviceItems: [{ name: 'Deep Home Cleaning', price: 5000, quantity: 1 }],
        date: '2026-08-20',
        time: '10:00 AM',
        address: '123 Main Street, Colombo',
        price: 5000,
        advanceAmount: 1000,
        balanceAmount: 4000,
        status: 'pending',
        paymentMethod: 'full-online'
      });
      const saved = await newBooking.save();
      bookings = [saved.toObject()];
    }

    console.log('\n================ AVAILABLE BOOKINGS ================');
    bookings.forEach((b, idx) => {
      console.log(`\n[Booking ${idx + 1}]`);
      console.log(`Mongo ID (_id): ${b._id}`);
      console.log(`Booking ID: ${b.bookingId || 'N/A'}`);
      console.log(`Service: ${b.serviceName || b.serviceType || 'N/A'}`);
      console.log(`Price: LKR ${b.price || 0}`);
      console.log(`Customer Email: ${b.customerEmail || b.email || 'N/A'}`);
      console.log(`Status: ${b.status}`);
      console.log(`Direct Payment URL (Mongo ID): http://localhost:3000/payment/${b._id}`);
      if (b.bookingId) {
        console.log(`Direct Payment URL (Booking ID): http://localhost:3000/payment/${b.bookingId}`);
      }
    });
    console.log('====================================================\n');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
