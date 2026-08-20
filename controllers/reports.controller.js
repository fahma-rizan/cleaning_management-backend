const Booking  = require('../models/Booking');
const StaffUser    = require('../models/User');
const CustomerUser = require('../models/User');
const { getStaffRatingStats } = require('../utils/staffStats');

exports.getBookings = async (req, res) => {
  try {
    const { from, to, service, status } = req.query;
    const filter = {};
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = from; if (to) filter.date.$lte = to; }
    if (service && service !== 'All') filter.serviceCategory = service;
    if (status  && status  !== 'All') filter.status = status;
    const bookings = await Booking.find(filter).sort({ date: -1 }).select('bookingId customerName serviceName serviceCategory date time status price paidAmount balanceAmount paymentMethod paymentStatus assignedStaffName');
    const summary = { total: bookings.length, completed: bookings.filter(b => b.status === 'completed').length, cancelled: bookings.filter(b => b.status === 'cancelled').length, pending: bookings.filter(b => b.status === 'pending').length, revenue: bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.paidAmount, 0) };
    res.json({ bookings, summary });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getPayments = async (req, res) => {
  try {
    const { period, method } = req.query;
    const filter = { paymentStatus: 'paid' };
    if (period) {
      const d = new Date();
      if (period === 'This Month')    d.setDate(1);
      if (period === 'Last 3 Months') d.setMonth(d.getMonth() - 3);
      if (period === 'Last 6 Months') d.setMonth(d.getMonth() - 6);
      if (period === 'This Year')     d.setMonth(0, 1);
      filter.date = { $gte: d.toISOString().split('T')[0] };
    }
    if (method && method !== 'All') filter.paymentMethod = method;
    const bookings = await Booking.find(filter).sort({ date: -1 }).select('bookingId customerName serviceName date price paidAmount paymentMethod paymentMethodName paymentStatus');
    res.json({ bookings, total: bookings.reduce((sum, b) => sum + b.paidAmount, 0), count: bookings.length });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getStaffPerformance = async (req, res) => {
  try {
    const { period, staff } = req.query;
    const bookingFilter = { status: 'completed' };
    if (period) {
      const d = new Date();
      if (period === 'This Month')    d.setDate(1);
      if (period === 'Last 3 Months') d.setMonth(d.getMonth() - 3);
      if (period === 'Last 6 Months') d.setMonth(d.getMonth() - 6);
      bookingFilter.date = { $gte: d.toISOString().split('T')[0] };
    }
    if (staff && staff !== 'All') bookingFilter.assignedStaffName = staff;
    const staffList = await StaffUser.find({ role: 'staff' }).select('name jobsCompleted staffStatus');
    const bookings  = await Booking.find(bookingFilter);
    // Same rating computation used on the Staff Management page — real
    // average of review ratings across bookings each staff worked on,
    // not the raw `rating` field on the User document, which nothing
    // ever writes to and always stays at its default.
    const ratingStatsByStaffId = await getStaffRatingStats(staffList.map(s => s._id));
    const report = staffList.map(s => {
      const stats = ratingStatsByStaffId.get(String(s._id));
      return {
        name: s.name,
        rating: stats ? Math.round(stats.avgRating * 10) / 10 : 0,
        jobsCompleted: bookings.filter(b => b.assignedStaffName === s.name || b.assignedTeam.some(t => t.staffName === s.name)).length,
        status: s.staffStatus,
      };
    });
    const summary = { totalStaff: report.length, activeStaff: report.filter(r => r.status === 'Active').length, totalJobs: report.reduce((s, r) => s + r.jobsCompleted, 0), avgRating: report.length > 0 ? (report.reduce((s, r) => s + r.rating, 0) / report.length).toFixed(2) : '0.00' };
    res.json({ staff: report, summary });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getCustomers = async (req, res) => {
  try {
    const { period, status } = req.query;
    const filter = { role: 'customer' };
    if (status && status !== 'All') filter.customerStatus = status;
    if (period) {
      const d = new Date();
      if (period === 'This Month')    d.setDate(1);
      if (period === 'Last 3 Months') d.setMonth(d.getMonth() - 3);
      if (period === 'Last 6 Months') d.setMonth(d.getMonth() - 6);
      filter.createdAt = { $gte: d };
    }
    const customers = await CustomerUser.find(filter).select('name email phone customerStatus totalBookings totalSpent loyaltyPoints joinDate lastBooking').sort({ totalSpent: -1 });
    res.json(customers);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};