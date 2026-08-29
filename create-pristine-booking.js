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

async function createPristineBooking() {
  try {
    await mongoose.connect(uri);
    
    const timestamp = Date.now();
    const newBooking = new Booking({
      bookingId: `BK-PAYTEST-${timestamp}`,
      customerName: 'Farhath Aaysha',
      customerEmail: 'farhathays.123@gmail.com',
      email: 'farhathays.123@gmail.com',
      serviceName: 'Full Home Deep Cleaning',
      serviceType: 'Home Cleaning',
      serviceItems: [
        { name: 'Full Home Deep Cleaning', price: 5000, quantity: 1 }
      ],
      date: '2026-08-25',
      time: '10:00 AM - 12:00 PM',
      address: 'No 45, Galle Road, Colombo',
      price: 5000,
      advanceAmount: 1000, // 20%
      balanceAmount: 4000,
      status: 'pending',
      paymentMethod: 'full-online',
    });

    const saved = await newBooking.save();
    console.log('CREATED_BOOKING_SUCCESS');
    console.log(`MONGO_ID: ${saved._id}`);
    console.log(`BOOKING_ID: ${saved.bookingId}`);
    console.log(`PAYMENT_URL_MONGO: http://localhost:3000/payment/${saved._id}`);
    console.log(`PAYMENT_URL_HUMAN: http://localhost:3000/payment/${saved.bookingId}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

createPristineBooking();
