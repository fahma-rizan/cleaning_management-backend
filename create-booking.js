const mongoose = require('mongoose');
const Booking = require('./models/Booking');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/payment-workflow';

async function createBooking() {
  try {
    await mongoose.connect(MONGO_URI);

    const customer = await User.findOne({ role: 'customer' });
    if (!customer) {
      throw new Error('No customer found in the database. Please create a customer first.');
    }

    const newBooking = new Booking({
      customerId: customer._id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      customerEmail: customer.email,
      serviceName: 'Test Service',
      address: '123 Test Street',
      status: 'confirmed',
    });

    const savedBooking = await newBooking.save();
    console.log('New booking created with ID:', savedBooking.bookingId);
  } catch (error) {
    console.error('Error creating booking:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

createBooking();
