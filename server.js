const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Middleware
// Allow any localhost dev-server port — Vite lands on 5174/5175/etc. whenever
// 5173 is already taken by another running instance, and CORS was silently
// blocking all API calls whenever that happened. Only localhost origins match.
const isLocalhostOrigin = (origin) => !origin || /^http:\/\/localhost:\d+$/.test(origin);
app.use(cors({
  origin: (origin, callback) => {
    if (isLocalhostOrigin(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
// PayHere's IPN webhook posts application/x-www-form-urlencoded, not JSON.
app.use(express.urlencoded({ extended: true }));

// Serve uploaded staff photos (getPhotoUrl() in the frontend expects
// http://localhost:5000/uploads/staff/<file> to resolve).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Socket.IO — live GPS updates for the admin dashboard ─────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isLocalhostOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});
app.set('io', io); // controllers reach it via req.app.get('io')
io.on('connection', (socket) => {
  console.log(`🔌 GPS socket connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`🔌 GPS socket disconnected: ${socket.id}`));
});

// Routes
app.use('/api/auth',       require('./routes/authRoutes'));
app.use('/api/bookings',   require('./routes/bookingRoutes'));
app.use('/api/staff',      require('./routes/staffRoutes'));
app.use('/api/customers',  require('./routes/customerRoutes'));
app.use('/api/admins',     require('./routes/adminRoutes'));
app.use('/api/overview',   require('./routes/overviewRoutes'));
app.use('/api/reviews',    require('./routes/reviewRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/reports',    require('./routes/reportRoutes'));
app.use('/api/offers',     require('./routes/offerRoutes'));
app.use('/api/pricelists', require('./routes/pricelistRoutes'));
app.use('/api/services',   require('./routes/serviceRoutes'));
app.use('/api/payments',   require('./routes/paymentRoutes'));
app.use('/api/settings',   require('./routes/settingsRoutes'));
app.use('/api/gps',        require('./routes/gpsRoutes'));
app.use('/api/inventory',         require('./routes/inventoryRoutes'));
app.use('/api/material-requests', require('./routes/materialRequestRoutes'));
app.use('/api/completion-reports',require('./routes/completionReportRoutes'));
app.use('/api/alerts',            require('./routes/alertRoutes'));
app.use('/api/loyalty',           require('./routes/loyaltyRoutes'));

// ─── payment-invoice-notifications feature set ─────────────────────────────────
app.use('/api/invoices',         require('./routes/invoiceRoutes'));
app.use('/api/refunds',          require('./routes/refundRoutes'));
app.use('/api/price-reductions', require('./routes/priceReductionRoutes'));
app.use('/api/email',            require('./routes/emailRoutes'));
app.use('/api/payhere',          require('./routes/payhereRoutes'));
app.use('/api/analytics',        require('./routes/analyticsRoutes'));
app.use('/api/notifications',    require('./routes/notificationRoutes'));
app.use('/api/audit',            require('./routes/auditRoutes'));
app.use('/api/staff-requests',   require('./routes/staffRequestRoutes'));

// Health check - open this in browser to confirm server is working
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Cloud Laundry Backend is running!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
});
