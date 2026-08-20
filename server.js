require('dotenv').config();
const express   = require('express');
const cors      = require('cors');

const path      = require('path');
const http      = require('http');
const { Server } = require('socket.io');
const cron      = require('node-cron');

const connectDB  = require('./config/db');
const User        = require('./models/User');

const adminRoutes    = require('./routes/admin.routes');
const staffRoutes    = require('./routes/staff.routes');
const customerRoutes = require('./routes/customer.routes');
const reviewRoutes   = require('./routes/review.routes');
const complaintRoutes= require('./routes/complaint.routes');
const overviewRoutes = require('./routes/overview.routes');
const reportsRoutes  = require('./routes/reports.routes');
const settingsRoutes = require('./routes/settings.routes');
const gpsRoutes      = require('./routes/gps.routes');
const authRoutes     = require('./routes/auth.routes');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST', 'PUT'] }
});

app.set('io', io);

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/admins',    adminRoutes);
app.use('/api/staff',     staffRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reviews',   reviewRoutes);
app.use('/api/complaints',complaintRoutes);
app.use('/api/overview',  overviewRoutes);
app.use('/api/reports',   reportsRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/gps',       gpsRoutes);

app.get('/', (req, res) => res.json({ message: 'CloudLaundry API running' }));

io.on('connection', (socket) => {
  console.log('Admin connected to GPS socket:', socket.id);
  socket.on('disconnect', () => console.log('Admin disconnected:', socket.id));
});

// Scheduler — mark customers inactive after 6 months of no bookings
const runInactiveCheck = async () => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const result = await User.updateMany(
      { role: 'customer', customerStatus: 'active', lastBooking: { $lt: sixMonthsAgo } },
      { $set: { customerStatus: 'inactive' } }
    );
    console.log(`Scheduler: ${result.modifiedCount} customers set to inactive`);
  } catch (err) {
    console.error('Scheduler error:', err);
  }
};

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  runInactiveCheck();
  cron.schedule('0 0 * * *', runInactiveCheck);
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});