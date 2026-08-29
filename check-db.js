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

async function checkDatabase() {
  try {
    console.log('🔍 Checking MongoDB connection...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!\n');
    
    // Get database name
    const connection = mongoose.connection;
    console.log(`📦 Database: ${connection.db.databaseName}`);
    console.log(`🌐 Host: ${connection.host}`);
    console.log(`📊 Collections in database:\n`);
    
    // List all collections
    const collections = await connection.db.listCollections().toArray();
    collections.forEach(col => {
      console.log(`   • ${col.name}`);
    });
    console.log('');
    
    // Check each model's collection
    const models = [
      { name: 'Bookings', model: Booking },
      { name: 'Invoices', model: Invoice },
      { name: 'Refunds', model: Refund },
      { name: 'Notifications', model: Notification },
      { name: 'Counters', model: Counter }
    ];
    
    for (const { name, model } of models) {
      try {
        const count = await model.countDocuments();
        console.log(`📋 ${name}: ${count} documents`);
        
        if (count > 0) {
          // Show sample document (first one)
          const sample = await model.findOne().lean();
          console.log(`   Sample: ${JSON.stringify(sample).substring(0, 150)}...`);
        }
      } catch (error) {
        console.log(`❌ Error checking ${name}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Database check completed successfully!');
    
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. MongoDB connection string is correct in .env file');
    console.error('   2. MongoDB server is running');
    console.error('   3. Network connection is stable');
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the check
checkDatabase();