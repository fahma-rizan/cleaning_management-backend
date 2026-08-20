const express       = require('express');
const cors          = require('cors');
const cookieParser  = require('cookie-parser');
const dotenv        = require('dotenv');
const rateLimit     = require('express-rate-limit');
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const morgan        = require('morgan');
const connectDB     = require('./config/database');
 
dotenv.config();
connectDB();
 
const app = express();
 
// Security headers
app.use(helmet());
 
// CORS — dev fallback covers common Vite/CRA ports; override via CLIENT_URL in prod
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
];

// In development, always keep the common dev-port fallbacks available in
// addition to CLIENT_URL — CRA/Vite silently pick the next free port when
// their default is taken, which previously required manually updating
// CLIENT_URL every time (e.g. localhost:3002 got 403'd by CORS while
// CLIENT_URL only listed 3000/3001).
const configuredOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((o) => o.trim())
  : [];
const allowedOrigins = process.env.NODE_ENV === 'development'
  ? [...new Set([...configuredOrigins, ...DEV_ORIGINS])]
  : (configuredOrigins.length ? configuredOrigins : DEV_ORIGINS);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
 
// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
 
// NoSQL injection prevention
app.use(mongoSanitize());

// Passport — must be initialised after body parsers, before routes
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());

// HTTP request logging (skip in test)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
 
// ── Rate limiters ──────────────────────────────────────────
const authLimiter = process.env.NODE_ENV === 'development'
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000, max: 10,
      standardHeaders: true, legacyHeaders: false,
      message: { success: false, message: 'Too many requests. Please try again in 1 hour.' },
    });
 
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
 
// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',               authLimiter, require('./routes/authRoutes'));
app.use('/api/loyalty',            apiLimiter,  require('./routes/loyaltyRoutes'));
app.use('/api/inventory/stock',    apiLimiter,  require('./routes/stockRoutes'));      // must be before /api/inventory
app.use('/api/inventory',          apiLimiter,  require('./routes/inventoryRoutes'));
app.use('/api/bookings',           apiLimiter,  require('./routes/bookingRoutes'));
app.use('/api/users',              apiLimiter,  require('./routes/userRoutes'));
app.use('/api/material-requests',  apiLimiter,  require('./routes/materialRequestRoutes'));
app.use('/api/completion-reports', apiLimiter,  require('./routes/completionReportRoutes'));
app.use('/api/alerts',             apiLimiter,  require('./routes/alertRoutes'));
app.use('/api/consumption-rates',  apiLimiter,  require('./routes/consumptionRateRoutes'));
app.use('/api/reports',            apiLimiter,  require('./routes/reportRoutes'));
app.use('/api/addresses',          apiLimiter,  require('./routes/addressRoutes'));
 
app.get('/api/health', (_req, res) =>
  res.status(200).json({ status: 'OK', service: 'Cloud Laundry API', env: process.env.NODE_ENV })
);
 
// ── 404 ────────────────────────────────────────────────────
app.use('*', (_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' })
);
 
// ── Global error handler ───────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});
 
// Loyalty points annual reset cron (Dec 31 midnight)
require('./utils/loyalty.cron');
 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Cloud Laundry API running on port ${PORT} [${process.env.NODE_ENV}]`)
);
 
module.exports = app;
 
