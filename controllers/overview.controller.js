const Booking = require('../models/Booking');
const PriceList = require('../models/PriceList');

exports.getStats = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayBookings = await Booking.find({ date: todayStr });
    res.json({
      todayOrders:    todayBookings.length,
      todayCompleted: todayBookings.filter(b => b.status === 'completed').length,
      todayCancelled: todayBookings.filter(b => b.status === 'cancelled').length,
      todayPending:   todayBookings.filter(b => b.status === 'pending').length,
      todayRevenue:   todayBookings.filter(b => b.paymentStatus === 'paid').reduce((sum, b) => sum + b.paidAmount, 0),
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getRevenueChart = async (req, res) => {
  try {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // Current-schema bookings: only count money actually collected.
      // 'paid' bookings count in full; 'partial' bookings count too, but
      // only their paidAmount (what's been received so far) — never the
      // outstanding balance. 'pending' bookings contribute nothing since
      // no money has changed hands yet.
      const newSchemaBookings = await Booking.find({
        date: { $regex: `^${prefix}` },
        serviceItems: { $exists: false },
        paymentStatus: { $in: ['paid', 'partial'] },
      }).select('paidAmount').lean();
      const newSchemaRevenue = newSchemaBookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

      // Legacy-schema bookings: advanceAmount is money already received up
      // front. balanceAmount only counts once balancePaid is true —
      // otherwise it's still outstanding (future) money and must be
      // excluded.
      const legacyBookings = await Booking.find({
        date: { $regex: `^${prefix}` },
        serviceItems: { $exists: true, $ne: [] },
      }).select('advanceAmount balanceAmount balancePaid').lean();
      const legacyRevenue = legacyBookings.reduce((sum, b) => {
        const advance = b.advanceAmount || 0;
        const balance = b.balancePaid ? (b.balanceAmount || 0) : 0;
        return sum + advance + balance;
      }, 0);

      data.push({ month: monthNames[d.getMonth()], revenue: newSchemaRevenue + legacyRevenue });
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getServiceBreakdown = async (req, res) => {
  try {
    // Two booking shapes coexist in this collection (legacy vs. current
    // schema), so each category needs several keywords to catch both:
    //  - current schema: single serviceType/serviceCategory/serviceName
    //    strings, e.g. "Home/Office Cleaning", "Laundry"
    //  - legacy schema: a serviceItems[] array of { name, price }, with
    //    freer-form names like "Apartment Deep Cleaning", "Laundry Service"
    // TODO: keyword lists below are inferred from a small sample — re-check
    // against the distinct-value output from diagnose_service_breakdown.js
    // and extend as needed.
    const categories = [
      { name: 'Home/Office Cleaning',    keywords: ['home', 'office', 'apartment', 'house'],          color: '#7C3AED' },
      { name: 'Laundry Cleaning',        keywords: ['laundry', 'wash', 'dry clean', 'press'],          color: '#3B82F6' },
      { name: 'Shampoo Vacuum Cleaning', keywords: ['shampoo', 'vacuum', 'sofa', 'carpet', 'mattress'],color: '#F59E0B' },
      { name: 'Curtains Cleaning',       keywords: ['curtain'],                                        color: '#D946EF' },
    ];

    const matchCategory = (text) => {
      if (!text) return null;
      const lower = String(text).toLowerCase();
      return categories.find(cat => cat.keywords.some(k => lower.includes(k))) || null;
    };

    const counts = Object.fromEntries(categories.map(c => [c.name, 0]));
    let otherCount = 0;

    // --- Current-schema bookings: single serviceType/serviceCategory/serviceName fields ---
    const newSchemaBookings = await Booking.find({ serviceItems: { $exists: false } })
      .select('serviceType serviceCategory serviceName')
      .lean();
    for (const b of newSchemaBookings) {
      const cat = matchCategory(b.serviceType) || matchCategory(b.serviceCategory) || matchCategory(b.serviceName);
      if (cat) counts[cat.name]++; else otherCount++;
    }

    // --- Legacy-schema bookings: serviceItems[] — each item counted toward
    // its own category, so one multi-service booking can add to more than
    // one slice (pie total can exceed total booking count by design). ---
    const legacyBookings = await Booking.find({ serviceItems: { $exists: true, $ne: [] } })
      .select('serviceItems')
      .lean();
    for (const b of legacyBookings) {
      for (const item of b.serviceItems) {
        const cat = matchCategory(item.name);
        if (cat) counts[cat.name]++; else otherCount++;
      }
    }

    const data = categories.map(cat => ({ name: cat.name, value: counts[cat.name], color: cat.color }));
    // Catch anything unmatched instead of silently dropping it — keeps the
    // total honest and surfaces data-quality issues instead of hiding them.
    if (otherCount > 0) {
      data.push({ name: 'Other / Unclassified', value: otherCount, color: '#9CA3AF' });
    }

    const total = data.reduce((sum, d) => sum + d.value, 0);
    res.json(total === 0 ? data.map(d => ({ ...d, value: 1 })) : data);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getRecentBookings = async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    let query = Booking.find().sort({ scheduledAt: -1, date: -1, createdAt: -1 }).select('bookingId customerName serviceName serviceCategory date time status price paidAmount paymentStatus scheduledAt');
    if (!showAll) query = query.limit(5);
    const bookings = await query;
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};