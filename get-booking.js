const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const Booking = require('./models/Booking');

async function getBooking() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get the most recent booking
    const booking = await Booking.findOne().sort({ createdAt: -1 });
    
    if (booking) {
      console.log('✅ Valid Booking Found!\n');
      console.log('📋 Booking ID:', booking.bookingId);
      console.log('🛠️  Service:', booking.serviceType);
      console.log('💰 Price: Rs.', booking.price);
      console.log('📅 Date:', booking.date, 'at', booking.time);
      console.log('📊 Status:', booking.status);
      console.log('🕐 Created:', new Date(booking.createdAt).toLocaleString());
      console.log('\n🔗 Use this URL to test:');
      console.log('   http://localhost:3000/payment/' + booking.bookingId);
    } else {
      console.log('❌ No bookings found in database');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getBooking();