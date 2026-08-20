const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Service = require('../models/Service');
const User = require('../models/User');
const Offer = require('../models/Offer');

const services = [
  {
    serviceId: 1,
    name: 'House Deep Cleaning',
    category: 'home',
    mainServiceType: 'Home/Office Cleaning',
    description: 'Comprehensive deep cleaning service for thorough home sanitization',
    basePrice: 8000,
    priceLabel: 'From LKR 8,000',
    duration: '4-6 hours',
    rating: 4.9,
    reviews: 312,
    image: 'https://images.unsplash.com/photo-1581578949510-fa7315c4c350?w=1080',
    features: ['Complete Home Sanitization', 'Hard-to-reach Areas', 'Appliance Cleaning', 'Window Cleaning'],
  },
  {
    serviceId: 3,
    name: 'Sofa Cleaning',
    category: 'shampoo',
    mainServiceType: 'Shampoo and Vacuum Cleaning',
    description: 'Deep sofa shampoo and vacuum cleaning for all sofa types',
    basePrice: 1000,
    priceLabel: 'From LKR 1,000/seat',
    duration: '2-3 hours',
    rating: 4.9,
    reviews: 198,
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1080',
    features: ['Fabric & Leather', 'Stain Removal', 'Odour Treatment', 'Steam Cleaning'],
  },
  {
    serviceId: 4,
    name: 'Curtain Cleaning',
    category: 'curtain',
    mainServiceType: 'Curtain Cleaning',
    description: 'Professional curtain cleaning with removal and installation options',
    basePrice: 2500,
    priceLabel: 'From LKR 2,500',
    duration: '1-2 days',
    rating: 4.7,
    reviews: 145,
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1080',
    features: ['Dry Cleaning', 'Steam Pressing', 'Removal & Install', 'Pickup & Delivery'],
  },
  {
    serviceId: 5,
    name: 'Commercial Cleaning',
    category: 'home',
    mainServiceType: 'Home/Office Cleaning',
    description: 'Professional cleaning services for offices and commercial workspaces',
    basePrice: 5000,
    priceLabel: 'From LKR 5,000',
    duration: '3-4 hours',
    rating: 4.8,
    reviews: 167,
    image: 'https://images.unsplash.com/photo-1581578949510-fa7315c4c350?w=1080',
    features: ['Desk Cleaning', 'Floor Mopping', 'Restroom Sanitizing', 'Trash Removal'],
  },
  {
    serviceId: 6,
    name: 'General Cleaning',
    category: 'home',
    mainServiceType: 'Home/Office Cleaning',
    description: 'Regular cleaning services including dusting, mopping, and organizing',
    basePrice: 2500,
    priceLabel: 'From LKR 2,500',
    duration: '2-3 hours',
    rating: 4.8,
    reviews: 234,
    image: 'https://images.unsplash.com/photo-1581578949510-fa7315c4c350?w=1080',
    features: ['Dusting & Wiping', 'Floor Cleaning', 'Kitchen Cleaning', 'Bathroom Sanitizing'],
  },
  {
    serviceId: 7,
    name: 'Floor Cleaning',
    category: 'home',
    mainServiceType: 'Home/Office Cleaning',
    description: 'Specialized floor cleaning for all types of flooring',
    basePrice: 3000,
    priceLabel: 'From LKR 3,000',
    duration: '2-3 hours',
    rating: 4.7,
    reviews: 189,
    image: 'https://images.unsplash.com/photo-1581578949510-fa7315c4c350?w=1080',
    features: ['Tile Cleaning', 'Hardwood Care', 'Marble Polishing', 'Grout Cleaning'],
  },
  {
    serviceId: 8,
    name: 'Floor - Cut and Polish',
    category: 'home',
    mainServiceType: 'Home/Office Cleaning',
    description: 'Professional floor cutting and polishing services for marble and granite',
    basePrice: 6500,
    priceLabel: 'From LKR 6,500',
    duration: '4-5 hours',
    rating: 4.9,
    reviews: 145,
    image: 'https://images.unsplash.com/photo-1581578949510-fa7315c4c350?w=1080',
    features: ['Diamond Cutting', 'High-Speed Polishing', 'Crystallization', 'Sealing'],
  },
  {
    serviceId: 9,
    name: 'Dry Cleaning',
    category: 'laundry',
    mainServiceType: 'Laundry',
    description: 'Professional dry cleaning for delicate and formal garments',
    basePrice: 500,
    priceLabel: 'From LKR 500/item',
    duration: '1-2 days',
    rating: 4.8,
    reviews: 302,
    image: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1080',
    features: ['Delicate Fabrics', 'Formal Wear', 'Stain Treatment', 'Professional Pressing'],
  },
  {
    serviceId: 10,
    name: 'Washing & Pressing',
    category: 'laundry',
    mainServiceType: 'Laundry',
    description: 'Full wash and professional pressing service for everyday clothes',
    basePrice: 200,
    priceLabel: 'From LKR 200/item',
    duration: '1 day',
    rating: 4.7,
    reviews: 410,
    image: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1080',
    features: ['Machine Wash', 'Hand Wash', 'Steam Press', 'Fold & Pack'],
  },
  {
    serviceId: 11,
    name: 'Pressing Only',
    category: 'laundry',
    mainServiceType: 'Laundry',
    description: 'Professional pressing and ironing for your garments',
    basePrice: 100,
    priceLabel: 'From LKR 100/item',
    duration: 'Same day',
    rating: 4.6,
    reviews: 276,
    image: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1080',
    features: ['Steam Pressing', 'Hand Pressing', 'Fold & Pack', 'Express Available'],
  },
  {
    serviceId: 13,
    name: 'Mattress Cleaning',
    category: 'shampoo',
    mainServiceType: 'Shampoo and Vacuum Cleaning',
    description: 'Deep mattress cleaning with steam treatment for a healthier sleep',
    basePrice: 750,
    priceLabel: 'From LKR 750/mattress',
    duration: '2-3 hours',
    rating: 4.8,
    reviews: 134,
    image: 'https://images.pexels.com/photos/6585759/pexels-photo-6585759.jpeg?w=600',
    features: ['Steam Cleaning', 'Dust Mite Treatment', 'Odour Removal', 'Sanitization'],
  },
  {
    serviceId: 14,
    name: 'Carpet Cleaning',
    category: 'shampoo',
    mainServiceType: 'Shampoo and Vacuum Cleaning',
    description: 'Professional carpet shampooing and vacuum cleaning service',
    basePrice: 500,
    priceLabel: 'From LKR 500/carpet',
    duration: '2-4 hours',
    rating: 4.7,
    reviews: 221,
    image: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80',
    features: ['Deep Shampoo', 'Stain Removal', 'Hot Water Extraction', 'Fast Drying'],
  },
];

const offers = [
  {
    title: '20% Off First Booking',
    description: 'Get 20% off on your very first booking with Cloud Laundry!',
    discountType: 'percentage',
    discountValue: 20,
    code: 'WELCOME20',
    minOrderAmount: 1000,
    maxUsagePerUser: 1,
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    badge: 'New',
    badgeColor: 'green',
  },
  {
    title: 'LKR 500 Off Laundry',
    description: 'Save LKR 500 on any laundry service order above LKR 2,000.',
    discountType: 'fixed',
    discountValue: 500,
    code: 'LAUNDRY500',
    applicableServices: [9, 10, 11],
    minOrderAmount: 2000,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    badge: 'Hot',
    badgeColor: 'red',
  },
  {
    title: '15% Off Home Cleaning',
    description: '15% discount on all home cleaning services this month.',
    discountType: 'percentage',
    discountValue: 15,
    code: 'CLEAN15',
    applicableServices: [1, 5, 6, 7, 8],
    minOrderAmount: 3000,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    badge: 'Limited',
    badgeColor: 'orange',
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cloud_laundry');
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Service.deleteMany({});
    await Offer.deleteMany({});
    console.log('🗑️  Cleared existing services and offers');

    // Seed services
    await Service.insertMany(services);
    console.log(`✅ Seeded ${services.length} services`);

    // Seed offers
    await Offer.insertMany(offers);
    console.log(`✅ Seeded ${offers.length} offers`);

    // Create admin user if not exists
    const existingAdmin = await User.findOne({ email: 'admin@cloudlaundry.lk' });
    if (!existingAdmin) {
      await User.create({
        name: 'Admin User',
        email: 'admin@cloudlaundry.lk',
        password: 'Admin@1234',
        role: 'admin',
        adminRole: 'Admin',
        verified: true,
        loyaltyPoints: 0,
      });
      console.log('✅ Admin user created: admin@cloudlaundry.lk / Admin@1234');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // Create demo customer if not exists
    const existingDemo = await User.findOne({ email: 'demo@cloudlaundry.lk' });
    if (!existingDemo) {
      await User.create({
        name: 'Demo User',
        email: 'demo@cloudlaundry.lk',
        password: 'Demo@1234',
        role: 'customer',
        verified: true,
        loyaltyPoints: 250,
        badge: 'Silver',
      });
      console.log('✅ Demo customer created: demo@cloudlaundry.lk / Demo@1234');
    } else {
      console.log('ℹ️  Demo customer already exists');
    }

    console.log('\n🚀 Seed complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
};

seed();
