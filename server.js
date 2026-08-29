const express  = require('express');
const cors     = require('cors');
const dotenv   = require('dotenv');
const mongoose = require('mongoose');
const http     = require('http');
const { initSocket } = require('./sockets/socketManager');

dotenv.config();

// ── Global Node.js error handlers ────────────────────────────────────────────
// Catches async errors outside try/catch (e.g. in cron jobs, socket handlers)
// Without these, Node.js crashes the entire process on an uncaught rejection.

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Promise Rejection:', {
    timestamp: new Date().toISOString(),
    reason:    reason instanceof Error ? reason.message : String(reason),
    stack:     reason instanceof Error ? reason.stack : undefined,
  });
  // In production: Sentry.captureException(reason);
  // Do NOT call process.exit() here — let the app keep running.
  // A single failed async operation should not bring down the whole server.
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception — this is serious:', {
    timestamp: new Date().toISOString(),
    message:   err.message,
    stack:     err.stack,
  });
  // uncaughtException means the process is in an unknown state.
  // Log it, then exit so PM2 / Docker can restart cleanly.
  // In production: Sentry.captureException(err);
  process.exit(1);
});

// Fail fast on missing critical env vars
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not set in .env. Server cannot start.');
}
if (!process.env.MONGODB_URI) {
  console.error('FATAL: MONGODB_URI is not set in .env');
  process.exit(1);
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  const maxAttempts = parseInt(process.env.MONGO_CONNECT_RETRIES, 10) || 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      attempt += 1;
      await mongoose.connect(uri);
      console.log('Connected to MongoDB successfully.');
      return;
    } catch (error) {
      console.error(`Error connecting to MongoDB (attempt ${attempt}/${maxAttempts}):`, error.message);
      if (attempt >= maxAttempts) {
        console.error('Max MongoDB connection attempts reached. Exiting.');
        process.exit(1);
      }
      // Exponential backoff with cap
      const delayMs = Math.min(5000 * attempt, 30000);
      console.log(`Retrying MongoDB connection in ${delayMs}ms...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
};

// Do not start the HTTP server until MongoDB is connected.
// connectDB will attempt connections with retries and exit on failure.
// We will await it below before calling httpServer.listen.

const app        = express();
const httpServer = http.createServer(app);
const io         = initSocket(httpServer);

app.set('socketio', io);

const PORT = process.env.PORT || 4000;

// Restrict CORS to known frontend origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3001',
  'http://localhost:3006',
].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
const notificationRoutes    = require('./routes/notifications');
const invoiceRoutes         = require('./routes/invoice');
const refundRoutes          = require('./routes/refund');
const paymentReportRoutes   = require('./routes/paymentReport');
const emailRoutes           = require('./routes/email');
const bookingRoutes         = require('./routes/booking');
const analyticsRoutes       = require('./routes/analytics');
const paymentReminderRoutes = require('./routes/paymentReminders');
const payhereRoutes               = require('./routes/payhere');
const priceReductionRoutes        = require('./routes/priceReduction');
const assistantRoutes             = require('./routes/assistantRoutes'); // NEW
const auditRoutes                 = require('./routes/audit');            // NEW
const notificationTemplateRoutes  = require('./routes/notificationTemplates'); // FIX: Was missing — templates route never registered
const feedbackRoutes              = require('./routes/feedback'); // NEW (task #21) — Feedback & Complaint (C.3a)
const errorHandler          = require('./middleware/errorHandler');

app.use('/api/notifications',      notificationRoutes);
app.use('/api/invoices',           invoiceRoutes);
app.use('/api/refunds',            refundRoutes);
app.use('/api/payment-report',     paymentReportRoutes);
app.use('/api/email',              emailRoutes);
app.use('/api/bookings',           bookingRoutes);
app.use('/api/analytics',          analyticsRoutes);
app.use('/api/payment-reminders',  paymentReminderRoutes);
app.use('/api/payhere',            payhereRoutes);
app.use('/api/price-reductions',          priceReductionRoutes);
app.use('/api/assistant',                 assistantRoutes);
app.use('/api/notification-templates',    notificationTemplateRoutes); // FIX: Register templates route
app.use('/api/feedback',                  feedbackRoutes); // NEW (task #21)
// app.use('/api/audit',                  auditRoutes);    // NEW
app.use(errorHandler);

// Start server only after MongoDB connection succeeds to avoid scheduler
// or DB operation failures when the database is not available.
(async () => {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // Start the server-side balance payment reminder cron job.
      const { startReminderScheduler } = require('./utils/reminderScheduler');
      startReminderScheduler();

      // Start the pre-cleaning reminder + post-completion feedback nudge
      // cron job (task #22 — Notification C.4 / C.6).
      const { startServiceReminderScheduler } = require('./utils/serviceReminderScheduler');
      startServiceReminderScheduler();
    });
  } catch (err) {
    console.error('Failed to start server due to DB error:', err);
    process.exit(1);
  }
})();