const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import all models
const Booking = require('./models/Booking');
const Invoice = require('./models/Invoice');
const Refund = require('./models/Refund');
const Notification = require('./models/Notification');
const Counter = require('./models/Counter');

async function showData() {
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!\n');
    
    // Show Bookings
    console.log('📋 BOOKINGS COLLECTION');
    console.log('=' .repeat(50));
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(5);
    if (bookings.length > 0) {
      bookings.forEach((booking, index) => {
        console.log(`\n${index + 1}. Booking ID: ${booking.bookingId}`);
        console.log(`   Service: ${booking.serviceType}`);
        console.log(`   Price: Rs. ${booking.price}`);
        console.log(`   Date: ${booking.date} at ${booking.time}`);
        console.log(`   Status: ${booking.status}`);
        console.log(`   Created: ${new Date(booking.createdAt).toLocaleString()}`);
      });
    } else {
      console.log('   No bookings found');
    }
    
    // Show Invoices
    console.log('\n\n📄 INVOICES COLLECTION');
    console.log('=' .repeat(50));
    const invoices = await Invoice.find().sort({ createdAt: -1 }).limit(5);
    if (invoices.length > 0) {
      invoices.forEach((invoice, index) => {
        console.log(`\n${index + 1}. Invoice: ${invoice.invoiceNumber}`);
        console.log(`   Type: ${invoice.invoiceType}`);
        console.log(`   Status: ${invoice.status}`);
        console.log(`   Amount: Rs. ${invoice.amount}`);
        console.log(`   Customer: ${invoice.customer.name}`);
        console.log(`   Created: ${new Date(invoice.createdAt).toLocaleString()}`);
      });
    } else {
      console.log('   No invoices found');
    }
    
    // Show Notifications
    console.log('\n\n🔔 NOTIFICATIONS COLLECTION');
    console.log('=' .repeat(50));
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(5);
    if (notifications.length > 0) {
      notifications.forEach((notification, index) => {
        console.log(`\n${index + 1}. ${notification.title}`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Message: ${notification.message}`);
        console.log(`   Read: ${notification.read ? 'Yes' : 'No'}`);
        console.log(`   Created: ${new Date(notification.createdAt).toLocaleString()}`);
      });
    } else {
      console.log('   No notifications found');
    }
    
    // Show Counters
    console.log('\n\n🔢 COUNTERS COLLECTION');
    console.log('=' .repeat(50));
    const counters = await Counter.find();
    if (counters.length > 0) {
      counters.forEach((counter, index) => {
        console.log(`\n${index + 1}. Counter: ${counter._id}`);
        console.log(`   Sequence: ${counter.seq}`);
      });
    } else {
      console.log('   No counters found');
    }
    
    // Show Refunds
    console.log('\n\n💰 REFUNDS COLLECTION');
    console.log('=' .repeat(50));
    const refunds = await Refund.find().sort({ createdAt: -1 }).limit(5);
    if (refunds.length > 0) {
      refunds.forEach((refund, index) => {
        console.log(`\n${index + 1}. Refund ID: ${refund.refundId}`);
        console.log(`   Invoice: ${refund.invoiceNumber}`);
        console.log(`   Amount: Rs. ${refund.amount}`);
        console.log(`   Status: ${refund.status}`);
        console.log(`   Reason: ${refund.reason}`);
        console.log(`   Created: ${new Date(refund.createdAt).toLocaleString()}`);
      });
    } else {
      console.log('   No refunds found');
    }
    
    console.log('\n\n✅ Data retrieval completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the check
showData();