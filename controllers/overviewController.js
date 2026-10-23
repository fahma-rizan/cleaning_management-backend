const Booking = require('../models/Booking');
const { getTodayLocalStr } = require('../utils/dateUtils');

// The 4 service categories the pie chart is designed to show — matched by
// keyword against whatever's on each booking, same categorisation as the
// old overview.controller.js:getServiceBreakdown. The new backend's
// Booking schema is fully unified now (no legacy serviceItems[] array to
// branch on), so this only needs the single-schema half of that logic.
const SERVICE_CATEGORIES = [
  { name: 'Home/Office Cleaning',    keywords: ['home', 'office', 'apartment', 'house'],           color: '#7C3AED' },
  { name: 'Laundry Cleaning',        keywords: ['laundry', 'wash', 'dry clean', 'press'],           color: '#3B82F6' },
  { name: 'Shampoo Vacuum Cleaning', keywords: ['shampoo', 'vacuum', 'sofa', 'carpet', 'mattress'], color: '#F59E0B' },
  { name: 'Curtains Cleaning',       keywords: ['curtain'],                                         color: '#D946EF' },
];

const matchServiceCategory = (text) => {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  return SERVICE_CATEGORIES.find(cat => cat.keywords.some(k => lower.includes(k))) || null;
};

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
    // Kept the new backend's status filter (excludes cancelled bookings)
    // but restored the old categorisation — this was regrouping bookings
    // by their raw serviceCategory/serviceName string, which produced one
    // pie slice per distinct value instead of the 4 designed categories.
    const bookings = await Booking.find({ status: { $ne: 'cancelled' } })
      .select('serviceType serviceCategory serviceName')
      .lean();

    const counts = Object.fromEntries(SERVICE_CATEGORIES.map(c => [c.name, 0]));
    let otherCount = 0;

    for (const b of bookings) {
      const cat = matchServiceCategory(b.serviceType)
        || matchServiceCategory(b.serviceCategory)
        || matchServiceCategory(b.serviceName);
      if (cat) counts[cat.name]++; else otherCount++;
    }

    const data = SERVICE_CATEGORIES.map(cat => ({ name: cat.name, value: counts[cat.name], color: cat.color }));
    // Catch anything unmatched instead of silently dropping it — keeps the
    // total honest and surfaces data-quality issues instead of hiding them.
    if (otherCount > 0) {
      data.push({ name: 'Other / Unclassified', value: otherCount, color: '#9CA3AF' });
    }

    res.json(data);
  } catch (err) {
    console.error('getServiceBreakdown error:', err);
    res.status(500).json({ error: 'Failed to load service breakdown' });
  }
};

// ─── GET /api/overview/recent-bookings ─────────────────────────────────────────
const getRecentBookings = async (req, res) => {
  try {
    // "View All" on the admin overview page passes ?all=true and expects
    // every booking, not just the latest 10 — that query param was never
    // read here, so the "View All" button always got the same 10-row
    // result back (see the matching fix in AdminOverview.tsx/api.ts for
    // why it looked like nothing happened at all).
    const showAll = req.query.all === 'true';
    let query = Booking.find()
      .sort({ createdAt: -1 })
      .select('bookingId customerName serviceName serviceCategory date time status price');
    if (!showAll) query = query.limit(10);

    const bookings = await query;
    res.json(bookings);
  } catch (err) {
    console.error('getRecentBookings error:', err);
    res.status(500).json({ error: 'Failed to load recent bookings' });
  }
};

module.exports = { getStats, getRevenueChart, getServiceBreakdown, getRecentBookings };