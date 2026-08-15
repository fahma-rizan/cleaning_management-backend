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
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Serve uploaded staff photos (getPhotoUrl() in the frontend expects
// http://localhost:5000/uploads/staff/<file> to resolve).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Socket.IO — live GPS updates for the admin dashboard ─────────────────────
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', credentials: true },
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
app.use('/api/settings',   require('./routes/settingsRoutes'));
app.use('/api/gps',        require('./routes/gpsRoutes'));

// Health check - open this in browser to confirm server is working
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Cloud Laundry Backend is running!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
});
