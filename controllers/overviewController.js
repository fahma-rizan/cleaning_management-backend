const Booking = require('../models/Booking');
const { getTodayLocalStr } = require('../utils/dateUtils');

const SERVICE_COLORS = ['#7C3AED', '#3B82F6', '#F59E0B', '#D946EF', '#10B981', '#64748B'];

// ─── GET /api/overview/stats ───────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const today = getTodayLocalStr();
    const todayBookings = await Booking.find({ date: today });

    const todayCompleted = todayBookings.filter(b => b.status === 'completed').length;
    const todayCancelled = todayBookings.filter(b => b.status === 'cancelled').length;
    const todayPending   = todayBookings.filter(b => ['pending', 'confirmed', 'in-progress'].includes(b.status)).length;
    const todayRevenue   = todayBookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

    res.json({
      todayOrders:    todayBookings.length,
      todayCompleted,
      todayCancelled,
      todayPending,
      todayRevenue,
    });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};

// ─── GET /api/overview/revenue-chart ───────────────────────────────────────────
// Last 7 months of revenue from completed bookings.
const getRevenueChart = async (req, res) => {
  try {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const months = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), monthIdx: d.getMonth(), label: monthNames[d.getMonth()] });
    }

    const bookings = await Booking.find({ status: 'completed' });

    const data = months.map(({ year, monthIdx, label }) => {
      const revenue = bookings
        .filter(b => {
          const d = new Date(b.completedAt || b.updatedAt);
          return d.getFullYear() === year && d.getMonth() === monthIdx;
        })
        .reduce((sum, b) => sum + (b.paidAmount || 0), 0);
      return { month: label, revenue };
    });

    res.json(data);
  } catch (err) {
    console.error('getRevenueChart error:', err);
    res.status(500).json({ error: 'Failed to load revenue chart' });
  }
};

// ─── GET /api/overview/service-breakdown ───────────────────────────────────────
const getServiceBreakdown = async (req, res) => {
  try {
    const bookings = await Booking.find({ status: { $ne: 'cancelled' } });
    const counts = {};
    bookings.forEach(b => {
      const key = b.serviceCategory || b.serviceName || 'Other';
      counts[key] = (counts[key] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const data = entries.map(([name, value], idx) => ({
      name,
      value,
      color: SERVICE_COLORS[idx % SERVICE_COLORS.length],
    }));

    res.json(data);
  } catch (err) {
    console.error('getServiceBreakdown error:', err);
    res.status(500).json({ error: 'Failed to load service breakdown' });
  }
};

// ─── GET /api/overview/recent-bookings ─────────────────────────────────────────
const getRecentBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('bookingId customerName serviceName serviceCategory date time status price');
    res.json(bookings);
  } catch (err) {
    console.error('getRecentBookings error:', err);
    res.status(500).json({ error: 'Failed to load recent bookings' });
  }
};

module.exports = { getStats, getRevenueChart, getServiceBreakdown, getRecentBookings };
