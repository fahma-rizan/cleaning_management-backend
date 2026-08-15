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
const Settings = require('./models/Settings');
const Offer = require('./models/Offer');
const bcrypt = require('bcryptjs');

// Customer-facing price lists — serviceId matches Services.tsx (9=Dry Cleaning,
// 10=Washing & Pressing, 11=Pressing). Read by GET /api/pricelists/:serviceId,
// editable afterwards from the admin Settings > Pricing tab.
const seedPriceLists = [
  {
    serviceId: 9, // Dry Cleaning — flat price per item
    pricing: {
      groups: [
        { label: 'Regular Clothing', items: [
          { name: 'Shirt', price: 400 }, { name: 'T-Shirt', price: 350 },
          { name: 'Thobe', price: 550 }, { name: 'Kurta', price: 500 },
          { name: 'Trouser', price: 450 }, { name: 'Shorts', price: 400 },
        ]},
        { label: 'Formal Wear', items: [
          { name: 'Blazer', price: 700 }, { name: 'Two Piece Suit', price: 850 },
          { name: 'Three Piece Suit', price: 1250 },
        ]},
        { label: "Women's Wear", items: [
          { name: 'Blouse', price: 300 }, { name: 'Dress (Short)', price: 500 },
          { name: 'Dress (Long)', price: 600 }, { name: 'Salwar (Top)', price: 500 },
          { name: 'Salwar (Full Set)', price: 700 }, { name: 'Saree', price: 900 },
          { name: 'Special Work Saree', price: 1250 }, { name: 'Skirts', price: 450 },
          { name: 'Special Work Salwar', price: 1250 },
        ]},
        { label: 'Traditional Wear', items: [{ name: 'Dhoti', price: 450 }] },
        { label: 'Special Occasion', items: [{ name: 'Bridal Dress/Lehenga', price: 3500 }] },
        { label: 'Winter Wear', items: [
          { name: 'Sweaters', price: 650 }, { name: 'Winter Jacket', price: 1000 },
          { name: 'Shawl', price: 175 }, { name: 'Cloak', price: 500 },
        ]},
      ],
    },
  },
  {
    serviceId: 11, // Pressing — fold/hang pricing
    pricing: {
      groups: [
        { label: 'Regular Clothing', items: [
          { name: 'Shirt', foldPrice: 175, hangPrice: 275 }, { name: 'T-Shirt', foldPrice: 125, hangPrice: 225 },
          { name: 'Thobe', foldPrice: 275, hangPrice: 375 }, { name: 'Kurta', foldPrice: 225, hangPrice: 325 },
          { name: 'Trouser', foldPrice: 225, hangPrice: 325 }, { name: 'Shorts', foldPrice: 175, hangPrice: 275 },
        ]},
        { label: "Women's Wear", items: [
          { name: 'Blouse', foldPrice: 175, hangPrice: 275 }, { name: 'Dress (Short)', foldPrice: 225, hangPrice: 325 },
          { name: 'Dress (Long)', foldPrice: 325, hangPrice: 425 }, { name: 'Salwar (Top)', foldPrice: 225, hangPrice: 325 },
          { name: 'Salwar (Full Set)', foldPrice: 325, hangPrice: 425 }, { name: 'Skirts', foldPrice: 225, hangPrice: 325 },
        ]},
        { label: 'Traditional Wear', items: [
          { name: 'Sarong', foldPrice: 325, hangPrice: 425 }, { name: 'Dhoti', foldPrice: 325 },
        ]},
        { label: 'Formal Wear', items: [
          { name: 'Blazer', foldPrice: 500 }, { name: 'Two Piece Suit', foldPrice: 750 },
          { name: 'Three Piece Suit', foldPrice: 900 },
        ]},
        { label: 'Special Wear', items: [
          { name: 'Saree', foldPrice: 600 }, { name: 'Special Work Saree', foldPrice: 850 },
          { name: 'S.W Lehenga/Dresses', foldPrice: 720 }, { name: 'Cloaks', foldPrice: 400 },
        ]},
        { label: 'Home Textiles', items: [
          { name: 'Bed Sheet', foldPrice: 225 }, { name: 'Pillow Cases', foldPrice: 125 },
        ]},
      ],
    },
  },
  {
    serviceId: 10, // Washing & Pressing — fold/hang pricing
    pricing: {
      groups: [
        { label: 'Regular Clothing', items: [
          { name: 'Shirt', foldPrice: 270, hangPrice: 370 }, { name: 'T-Shirt', foldPrice: 220, hangPrice: 320 },
          { name: 'Thobe', foldPrice: 370, hangPrice: 470 }, { name: 'Kurta', foldPrice: 320, hangPrice: 420 },
          { name: 'Trouser', foldPrice: 320, hangPrice: 420 }, { name: 'Shorts', foldPrice: 270, hangPrice: 370 },
          { name: 'Vset', foldPrice: 170, hangPrice: 270 },
        ]},
        { label: "Women's Wear", items: [
          { name: 'Blouse', foldPrice: 270, hangPrice: 370 }, { name: 'Dress (Short)', foldPrice: 320, hangPrice: 420 },
          { name: 'Dress (Long)', foldPrice: 420, hangPrice: 520 }, { name: 'Salwar (Top)', foldPrice: 320, hangPrice: 420 },
          { name: 'Salwar (Full Set)', foldPrice: 420, hangPrice: 520 }, { name: 'Skirts', foldPrice: 320, hangPrice: 420 },
        ]},
        { label: 'Traditional Wear', items: [{ name: 'Sarong', foldPrice: 420, hangPrice: 520 }] },
        { label: 'Home Textiles', items: [
          { name: 'Pillow Cases', foldPrice: 170 }, { name: 'Bedsheets', foldPrice: 350 },
          { name: 'Bathrobe', foldPrice: 650 },
        ]},
      ],
    },
  },
];

const seedOffers = [
  {
    title: '20% Off First Booking', description: 'New customers get 20% off on their first cleaning service',
    discountType: 'percentage', discountValue: 20, code: 'WELCOME20',
    validFrom: '', validTo: 'Ongoing', applicableServices: ['all'], isActive: true,
  },
  {
    title: 'Deep Clean Special', description: 'Save 15% on deep cleaning services this month',
    discountType: 'percentage', discountValue: 15, code: 'DEEPCLEAN15',
    validFrom: '', validTo: 'Ongoing', applicableServices: ['all'], isActive: true,
  },
  {
    title: 'Loyalty Rewards', description: 'Silver members get 10% off all services',
    discountType: 'percentage', discountValue: 10, code: 'SILVER10',
    validFrom: '', validTo: 'Ongoing', applicableServices: ['all'], isActive: true,
  },
];

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

  // ── Price lists (Dry Cleaning / Pressing / Washing & Pressing) ──────────────
  const settings = await Settings.getSingleton();
  for (const pl of seedPriceLists) {
    const idx = settings.priceLists.findIndex(p => p.serviceId === pl.serviceId);
    if (idx >= 0) settings.priceLists[idx] = pl;
    else settings.priceLists.push(pl);
  }
  settings.markModified('priceLists');
  await settings.save();
  console.log(`✅ Seeded price lists for services: ${seedPriceLists.map(p => p.serviceId).join(', ')}`);

  // ── Default offers ───────────────────────────────────────────────────────────
  for (const offerData of seedOffers) {
    const existing = await Offer.findOne({ code: offerData.code });
    if (existing) {
      await Offer.updateOne({ code: offerData.code }, { $set: offerData });
      console.log(`🔄 Reset:   offer ${offerData.code}`);
    } else {
      await Offer.create(offerData);
      console.log(`✅ Created: offer ${offerData.code}`);
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
