/**
 * Run this once to create (or reset) the default admin and staff accounts.
 * Command: npm run seed
 *
 * If the account already exists it will be reset (password + flags updated).
 * Staff accounts will have requiresPasswordChange: true so first-login works.
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const seedUsers = [
  {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@cloudlaundry.lk',
    password: 'admin123',
    phone: '0112345678',
    role: 'admin',
    isVerified: true,
    requiresPasswordChange: false,
    isAvailable: false,
  },
  {
    firstName: 'Operations',
    lastName: 'Manager',
    email: 'ops@cloudlaundry.lk',
    password: 'ops123',
    phone: '0112345679',
    role: 'admin',
    adminRole: 'Operations Manager',
    isVerified: true,
    requiresPasswordChange: false,
    isAvailable: false,
  },
  {
    firstName: 'Customer',
    lastName: 'Support',
    email: 'support@cloudlaundry.lk',
    password: 'support123',
    phone: '0112345680',
    role: 'admin',
    adminRole: 'Customer Support',
    isVerified: true,
    requiresPasswordChange: false,
    isAvailable: false,
  },
  {
    firstName: 'Staff',
    lastName: 'User',
    email: 'staff@cloudlaundry.lk',
    password: 'staff123',          // temporary password — must change on first login
    phone: '0112345681',
    role: 'staff',
    isVerified: true,
    requiresPasswordChange: true,  // triggers the first-login password change flow
    isAvailable: true,
  },
];

const seed = async () => {
  await connectDB();
  console.log('\n🌱 Seeding database...\n');

  for (const userData of seedUsers) {
    const existing = await User.findOne({ email: userData.email });

    if (existing) {
      // Hash the seed password and force-update the account
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);

      await User.updateOne(
        { email: userData.email },
        {
          $set: {
            password:              hashedPassword,
            requiresPasswordChange: userData.requiresPasswordChange,
            isAvailable:           userData.isAvailable ?? true,
            isVerified:            true,
          },
        }
      );
      console.log(`🔄 Reset:   ${userData.email}  (password restored to: ${userData.password})`);
    } else {
      await User.create(userData);
      console.log(`✅ Created: ${userData.email}  (password: ${userData.password})`);
    }
  }

  console.log('\n✅ Seeding complete!');
  console.log('   staff@cloudlaundry.lk  →  first login required (temp password: staff123)\n');
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
