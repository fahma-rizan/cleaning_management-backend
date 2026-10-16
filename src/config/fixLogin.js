require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const adminHash = await bcrypt.hash('Admin@1234', 10);
  const demoHash = await bcrypt.hash('Demo@1234', 10);

  await User.updateOne(
    { email: 'admin@cloudlaundry.lk' },
    {
      $set: {
        firstName: 'Admin',
        lastName: 'User',
        name: 'Admin User',
        password: adminHash,
        role: 'admin',
        adminRole: 'Operations Manager',
        isVerified: true,
        isActive: true,
      },
    },
    { upsert: true }
  );
  console.log('✅ Admin fixed: admin@cloudlaundry.lk / Admin@1234');

  await User.updateOne(
    { email: 'demo@cloudlaundry.lk' },
    {
      $set: {
        firstName: 'Demo',
        lastName: 'User',
        name: 'Demo User',
        password: demoHash,
        role: 'customer',
        isVerified: true,
        isActive: true,
        loyaltyPoints: 250,
        badge: 'Silver',
      },
    },
    { upsert: true }
  );
  console.log('✅ Demo fixed: demo@cloudlaundry.lk / Demo@1234');

  await mongoose.disconnect();
  console.log('🚀 Done. Try logging in now.');
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});