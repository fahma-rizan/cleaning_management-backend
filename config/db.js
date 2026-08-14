const mongoose = require('mongoose');
const dns = require('dns');
const { promisify } = require('util');

// Force Google DNS for ALL lookups — fixes getaddrinfo ENOTFOUND on Windows
// dns.setServers alone only affects dns.resolve*, not the system getaddrinfo call.
// The custom lookup function below routes every hostname through Google DNS (8.8.8.8).
dns.setServers(['8.8.8.8', '8.8.4.4']);
const resolve4 = promisify(dns.resolve4);

const lookup = (hostname, options, callback) => {
  resolve4(hostname)
    .then(([address]) => callback(null, address, 4))
    .catch(err => callback(err));
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
      lookup,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
