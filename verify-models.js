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
const PaymentReminder = require('./models/PaymentReminder');

async function verifyModels() {
  try {
    console.log('🔍 Verifying all required database models...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!\n');
    
    const connection = mongoose.connection;
    
    // List all collections in database
    const allCollections = await connection.db.listCollections().toArray();
    const collectionNames = allCollections.map(col => col.name);
    
    console.log('📊 All collections in database:');
    collectionNames.forEach(name => console.log(`   • ${name}`));
    console.log('');
    
    // Define expected models and their collection names
    const expectedModels = [
      { name: 'Booking', collection: 'bookings', model: Booking },
      { name: 'Invoice', collection: 'invoices', model: Invoice },
      { name: 'Refund', collection: 'refunds', model: Refund },
      { name: 'Notification', collection: 'notifications', model: Notification },
      { name: 'Counter', collection: 'counters', model: Counter },
      { name: 'PaymentReminder', collection: 'paymentreminders', model: PaymentReminder }
    ];
    
    console.log('🔍 Checking each required model:\n');
    
    let allModelsExist = true;
    const missingModels = [];
    
    for (const { name, collection, model } of expectedModels) {
      const exists = collectionNames.includes(collection);
      const count = exists ? await model.countDocuments() : 0;
      
      if (exists) {
        console.log(`✅ ${name}`);
        console.log(`   Collection: ${collection}`);
        console.log(`   Documents: ${count}`);
        
        // Show sample if exists
        if (count > 0) {
          const sample = await model.findOne().lean();
          const sampleStr = JSON.stringify(sample);
          console.log(`   Sample: ${sampleStr.substring(0, 100)}...`);
        }
      } else {
        console.log(`❌ ${name}`);
        console.log(`   Collection '${collection}' NOT FOUND`);
        allModelsExist = false;
        missingModels.push(name);
      }
      console.log('');
    }
    
    // Check for any extra collections not in our models
    const expectedCollections = expectedModels.map(m => m.collection);
    const extraCollections = collectionNames.filter(c => !expectedCollections.includes(c));
    
    if (extraCollections.length > 0) {
      console.log('📋 Extra collections found (not in models):');
      extraCollections.forEach(name => console.log(`   • ${name}`));
      console.log('');
    }
    
    // Summary
    console.log('═'.repeat(60));
    if (allModelsExist) {
      console.log('✅ ALL REQUIRED MODELS ARE PRESENT!');
      console.log(`   Total collections: ${collectionNames.length}`);
      console.log(`   All ${expectedModels.length} models verified.`);
    } else {
      console.log('❌ SOME MODELS ARE MISSING!');
      console.log('   Missing models:');
      missingModels.forEach(name => console.log(`     • ${name}`));
    }
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run verification
verifyModels();