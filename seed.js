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
const InventoryItem = require('./models/InventoryItem');
const InventoryTransaction = require('./models/InventoryTransaction');
const MaterialRequest = require('./models/MaterialRequest');
const LoyaltyTransaction = require('./models/LoyaltyTransaction');
const Booking = require('./models/Booking');
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
    adminRole: 'Super Admin',
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

// ── Inventory items ──────────────────────────────────────────────────────────
const seedInventoryItems = [
  { sku: 'IRN-001',  name: 'Steam Iron',                  type: 'equipment',  quantity: 6,  unit: 'units',  lowStockThreshold: 5 },
  { sku: 'CONS-001', name: 'All-purpose cleaner',         type: 'consumable', quantity: 47, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-002', name: 'Floor cleaner',                type: 'consumable', quantity: 50, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-003', name: 'Bathroom / toilet cleaner',   type: 'consumable', quantity: 50, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-004', name: 'Kitchen degreaser',           type: 'consumable', quantity: 50, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-005', name: 'Glass cleaner',               type: 'consumable', quantity: 48, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-006', name: 'Cabinet and drawer cleaner',  type: 'consumable', quantity: 50, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-019', name: 'High-speed polishing compound', type: 'consumable', quantity: 40, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-020', name: 'Crystallization chemical',   type: 'consumable', quantity: 35, unit: 'litres', lowStockThreshold: 10 },
  { sku: 'CONS-029', name: 'Upholstery sanitizer spray',  type: 'consumable', quantity: 49, unit: 'units',  lowStockThreshold: 10 },
  { sku: 'CONS-030', name: 'Allergen treatment solution', type: 'consumable', quantity: 49, unit: 'units',  lowStockThreshold: 10 },
  { sku: 'CONS-040', name: 'Microfiber cloths',           type: 'consumable', quantity: 18, unit: 'pieces', lowStockThreshold: 15 },
  { sku: 'CONS-045', name: 'Gloves (disposable)',         type: 'consumable', quantity: 28, unit: 'pieces', lowStockThreshold: 20 },
  { sku: 'CONS-049', name: 'Buffing pads',                type: 'consumable', quantity: 25, unit: 'pieces', lowStockThreshold: 8 },
  { sku: 'CONS-050', name: 'Diamond cutting pads',        type: 'consumable', quantity: 22, unit: 'pieces', lowStockThreshold: 8 },
  { sku: 'EQ-005',   name: 'Vacuum Cleaner',               type: 'equipment',  quantity: 4,  unit: 'units',  lowStockThreshold: 3 },
  { sku: 'EQ-008',   name: 'Pressure Washer',              type: 'equipment',  quantity: 2,  unit: 'units',  lowStockThreshold: 2 },
  { sku: 'EQ-012',   name: 'Steam cleaner machine',        type: 'equipment',  quantity: 0,  unit: 'units',  lowStockThreshold: 1 },
  { sku: 'EQ-015',   name: 'Floor Polisher',               type: 'equipment',  quantity: 3,  unit: 'units',  lowStockThreshold: 2 },
  { sku: 'CONS-060', name: 'Fabric freshener spray',       type: 'consumable', quantity: 8,  unit: 'litres', lowStockThreshold: 10 },
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
            role:                   userData.role,
            adminRole:              userData.adminRole,
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

  // ── Inventory items ──────────────────────────────────────────────────────────
  const itemIdBySku = {};
  for (const itemData of seedInventoryItems) {
    let doc = await InventoryItem.findOne({ sku: itemData.sku });
    if (doc) {
      await InventoryItem.updateOne({ sku: itemData.sku }, { $set: itemData });
      doc = await InventoryItem.findOne({ sku: itemData.sku });
    } else {
      doc = await InventoryItem.create(itemData);
    }
    itemIdBySku[itemData.sku] = doc._id;
  }
  console.log(`✅ Seeded ${seedInventoryItems.length} inventory items`);

  // A couple of restock transactions so the Monthly Report tab has real numbers.
  const restockSku = 'CONS-049'; // Buffing pads
  const restockItem = await InventoryItem.findOne({ sku: restockSku });
  if (restockItem) {
    const already = await InventoryTransaction.findOne({ itemId: restockItem._id, reference: 'SEED-DEMO' });
    if (!already) {
      const previousQty = restockItem.quantity;
      await InventoryTransaction.create({
        itemId: restockItem._id, type: 'deduct', quantity: 10,
        previousQty, newQty: previousQty, reference: 'SEED-DEMO', notes: 'Demo usage on a completed booking',
      });
      await InventoryTransaction.create({
        itemId: itemIdBySku['CONS-020'], type: 'deduct', quantity: 2,
        previousQty: 35, newQty: 35, reference: 'SEED-DEMO', notes: 'Demo usage',
      });
      await InventoryTransaction.create({
        itemId: itemIdBySku['CONS-050'], type: 'deduct', quantity: 10,
        previousQty: 22, newQty: 22, reference: 'SEED-DEMO', notes: 'Demo usage',
      });
      await InventoryTransaction.create({
        itemId: itemIdBySku['CONS-045'], type: 'deduct', quantity: 10,
        previousQty: 28, newQty: 28, reference: 'SEED-DEMO', notes: 'Demo usage',
      });
      await InventoryTransaction.create({
        itemId: itemIdBySku['CONS-019'], type: 'deduct', quantity: 3,
        previousQty: 40, newQty: 40, reference: 'SEED-DEMO', notes: 'Demo usage',
      });
      console.log('✅ Seeded demo inventory transactions for Monthly Report');
    }
  }

  // ── Material requests, tied to real existing bookings ────────────────────────
  const demoBookings = await Booking.find({ customerName: 'sathushiya saravanapava' }).limit(4);
  if (demoBookings.length > 0 && (await MaterialRequest.countDocuments()) === 0) {
    const templates = [
      {
        status: 'approved',
        items: [
          { itemType: 'consumable', sku: 'CONS-029', name: 'Upholstery sanitizer spray', requestedQty: 1 },
          { itemType: 'consumable', sku: 'CONS-030', name: 'Allergen treatment solution', requestedQty: 1 },
          { itemType: 'consumable', sku: 'CONS-040', name: 'Microfiber cloths',            requestedQty: 10 },
          { itemType: 'consumable', sku: 'CONS-045', name: 'Gloves (disposable)',          requestedQty: 5 },
          { itemType: 'equipment',  sku: 'EQ-012',   name: 'Steam cleaner machine',        requestedQty: 1 },
        ],
      },
      {
        status: 'pending',
        items: [
          { itemType: 'consumable', sku: 'CONS-019', name: 'High-speed polishing compound', requestedQty: 3 },
          { itemType: 'consumable', sku: 'CONS-020', name: 'Crystallization chemical',       requestedQty: 2 },
          { itemType: 'consumable', sku: 'CONS-050', name: 'Diamond cutting pads',            requestedQty: 10 },
        ],
      },
      {
        status: 'pending',
        items: [
          { itemType: 'consumable', sku: 'CONS-001', name: 'All-purpose cleaner', requestedQty: 5 },
          { itemType: 'consumable', sku: 'CONS-002', name: 'Floor cleaner',       requestedQty: 5 },
          { itemType: 'consumable', sku: 'CONS-005', name: 'Glass cleaner',       requestedQty: 3 },
        ],
      },
    ];

    for (let i = 0; i < Math.min(templates.length, demoBookings.length); i++) {
      const booking = demoBookings[i];
      const template = templates[i];
      const items = await Promise.all(template.items.map(async (line) => {
        const item = await InventoryItem.findOne({ sku: line.sku });
        const inStock = item ? item.quantity : 0;
        return {
          itemType: line.itemType, itemId: item?._id, name: line.name, sku: line.sku,
          requestedQty: line.requestedQty, inStock, sufficient: inStock >= line.requestedQty,
        };
      }));
      await MaterialRequest.create({ bookingId: booking._id, items, status: template.status });
    }
    console.log(`✅ Seeded ${Math.min(templates.length, demoBookings.length)} material requests`);
  }

  // ── Loyalty demo data for an existing real customer ──────────────────────────
  const loyaltyDemoUser = await User.findOne({ email: 'sathu@gmail.com' });
  if (loyaltyDemoUser && (await LoyaltyTransaction.countDocuments({ userId: loyaltyDemoUser._id })) === 0) {
    loyaltyDemoUser.lifetimePoints = 1612;
    loyaltyDemoUser.loyaltyPoints = 862;
    loyaltyDemoUser.badge = 'Platinum';
    loyaltyDemoUser.tierDiscountsUsed = { Silver: true, Gold: true, Platinum: true };
    await loyaltyDemoUser.save();

    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const txns = [
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(52) },
      { type: 'redeemed', points: -200, reason: 'Redeemed 200 pts for Rs. 200 discount', createdAt: daysAgo(52) },
      { type: 'bonus',    points: 0,    reason: 'Tier upgraded from gold to platinum — lifetime points reached 700', createdAt: daysAgo(45) },
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(45) },
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(38) },
      { type: 'redeemed', points: -150, reason: 'Redeemed 150 pts for Rs. 150 discount', createdAt: daysAgo(38) },
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(30) },
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(22) },
      { type: 'earned',   points: 150,  reason: 'Earned for booking payment (full)', createdAt: daysAgo(11) },
    ];
    for (const t of txns) {
      await LoyaltyTransaction.create({ userId: loyaltyDemoUser._id, ...t });
    }
    console.log(`✅ Seeded loyalty demo data for ${loyaltyDemoUser.email} (Platinum, 1,612 lifetime pts)`);
  }

  console.log('\n✅ Seeding complete!');
  console.log('   staff@cloudlaundry.lk  →  first login required (temp password: staff123)\n');
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
