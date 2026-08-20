const User                 = require('../models/User');
const Booking               = require('../models/Booking');
const AvailabilityRequest    = require('../models/AvailabilityRequest');
const TaskDeclineRequest     = require('../models/TaskDeclineRequest');
const { applyTaskDecline }   = require('./bookingController');

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in-progress'];

// ════════════════════════════════════════════════════════════════════════════
// Availability requests
// ════════════════════════════════════════════════════════════════════════════

// ─── POST /api/staff-requests/availability ─────────────────────────────────────
// Staff submits a request to be marked Unavailable. Does NOT change
// isAvailable — only an admin approval does that (see approveAvailability).
const requestUnavailability = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required.' });
    }

    const existing = await AvailabilityRequest.findOne({ staffId: req.user._id, status: 'pending' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have a pending availability request.' });
    }

    const request = await AvailabilityRequest.create({
      staffId:    req.user._id,
      staffName:  req.user.name,
      staffEmail: req.user.email,
      reason:     reason.trim(),
    });

    res.status(201).json({
      success: true,
      message: 'Unavailability request submitted — waiting for admin approval. You remain Available until then.',
      request,
    });
  } catch (err) {
    console.error('requestUnavailability error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff-requests/availability/end ────────────────────────────────
// Staff ends their own approved leave early — immediate, no approval needed
// (only *becoming* Unavailable requires approval).
const endUnavailability = async (req, res) => {
  try {
    const staff = await User.findById(req.user._id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });

    staff.isAvailable = true;
    staff.availabilityLogs.push({ status: 'available', changedAt: new Date() });
    await staff.save();

    res.json({ success: true, isAvailable: true });
  } catch (err) {
    console.error('endUnavailability error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff-requests/availability/mine ──────────────────────────────────
// Staff checks whether they currently have a pending unavailability request
// (e.g. after a page refresh, so the "pending approval" state survives).
const getMyPendingAvailabilityRequest = async (req, res) => {
  try {
    const request = await AvailabilityRequest.findOne({ staffId: req.user._id, status: 'pending' });
    res.json({ success: true, request: request || null });
  } catch (err) {
    console.error('getMyPendingAvailabilityRequest error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff-requests/availability ──────────────────────────────────────
const getAvailabilityRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status.toLowerCase();
    const requests = await AvailabilityRequest.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    console.error('getAvailabilityRequests error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff-requests/availability/:id/approve ────────────────────────
const approveAvailabilityRequest = async (req, res) => {
  try {
    const request = await AvailabilityRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This request was already ${request.status}.` });
    }

    request.status     = 'approved';
    request.reviewedBy = req.user.name;
    request.reviewNote = req.body?.note || '';
    request.reviewedAt = new Date();
    await request.save();

    const staff = await User.findById(request.staffId);
    if (staff) {
      staff.isAvailable = false;
      staff.availabilityLogs.push({
        status: 'unavailable', changedAt: new Date(), reason: request.reason,
      });
      await staff.save();
    }

    res.json({ success: true, request });
  } catch (err) {
    console.error('approveAvailabilityRequest error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff-requests/availability/:id/reject ─────────────────────────
const rejectAvailabilityRequest = async (req, res) => {
  try {
    const request = await AvailabilityRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This request was already ${request.status}.` });
    }

    request.status     = 'rejected';
    request.reviewedBy = req.user.name;
    request.reviewNote = req.body?.note || '';
    request.reviewedAt = new Date();
    await request.save();

    // Staff member remains Available — nothing to change on the User doc.
    res.json({ success: true, request });
  } catch (err) {
    console.error('rejectAvailabilityRequest error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Task decline requests
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/staff-requests/decline ────────────────────────────────────────────
const getDeclineRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status.toLowerCase();
    const requests = await TaskDeclineRequest.find(filter).sort({ createdAt: -1 }).lean();

    const bookingIds = requests.map(r => r.bookingId);
    const bookings = await Booking.find({ _id: { $in: bookingIds } })
      .select('bookingId serviceName date time status').lean();
    const bookingById = new Map(bookings.map(b => [String(b._id), b]));

    const shaped = requests.map(r => ({
      ...r,
      booking: bookingById.get(String(r.bookingId)) || null,
    }));

    res.json({ success: true, requests: shaped });
  } catch (err) {
    console.error('getDeclineRequests error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff-requests/decline/:id/approve ─────────────────────────────
// Actually performs the decline now — removes the staff member from the
// booking and tries to find a replacement (see bookingController.applyTaskDecline).
const approveDeclineRequest = async (req, res) => {
  try {
    const request = await TaskDeclineRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This request was already ${request.status}.` });
    }

    const booking = await Booking.findById(request.bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    await applyTaskDecline(booking, request.staffId, request.staffName, request.staffEmail, request.reason);

    request.status     = 'approved';
    request.reviewedBy = req.user.name;
    request.reviewNote = req.body?.note || '';
    request.reviewedAt = new Date();
    await request.save();

    res.json({ success: true, request, booking });
  } catch (err) {
    console.error('approveDeclineRequest error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff-requests/decline/:id/reject ──────────────────────────────
const rejectDeclineRequest = async (req, res) => {
  try {
    const request = await TaskDeclineRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This request was already ${request.status}.` });
    }

    request.status     = 'rejected';
    request.reviewedBy = req.user.name;
    request.reviewNote = req.body?.note || '';
    request.reviewedAt = new Date();
    await request.save();

    // Task stays assigned to the staff member — nothing to change on the booking.
    res.json({ success: true, request });
  } catch (err) {
    console.error('rejectDeclineRequest error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff-requests/pending-counts ─────────────────────────────────────
// Powers the sidebar notification badges.
const getPendingCounts = async (req, res) => {
  try {
    const [availability, decline] = await Promise.all([
      AvailabilityRequest.countDocuments({ status: 'pending' }),
      TaskDeclineRequest.countDocuments({ status: 'pending' }),
    ]);
    res.json({ success: true, availability, decline });
  } catch (err) {
    console.error('getPendingCounts error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Staff Task Overview
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/staff/overview ─────────────────────────────────────────────────
// All staff with their task counts, for the admin's Staff Task Overview list.
const getStaffOverview = async (req, res) => {
  try {
    const staffList = await User.find({ role: 'staff' })
      .select('name email isAvailable').lean();

    const overview = await Promise.all(staffList.map(async (staff) => {
      const staffFilter = {
        $or: [{ assignedStaffId: staff._id }, { 'assignedTeam.staffId': staff._id }],
      };
      const [assigned, completed, pending, declined] = await Promise.all([
        Booking.countDocuments({ ...staffFilter, status: { $in: ACTIVE_STATUSES } }),
        Booking.countDocuments({ ...staffFilter, status: 'completed' }),
        Booking.countDocuments({ ...staffFilter, status: { $in: ['pending', 'confirmed'] } }),
        TaskDeclineRequest.countDocuments({ staffId: staff._id, status: 'approved' }),
      ]);
      return {
        staffId:       staff._id,
        name:          staff.name,
        email:         staff.email,
        isAvailable:   staff.isAvailable,
        totalAssigned: assigned,
        totalCompleted: completed,
        totalPending:  pending,
        totalDeclined: declined,
      };
    }));

    res.json({ success: true, staff: overview });
  } catch (err) {
    console.error('getStaffOverview error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff/:id/tasks ───────────────────────────────────────────────────
// Detailed assigned/pending/completed task breakdown for one staff member.
const getStaffTaskDetails = async (req, res) => {
  try {
    const staff = await User.findOne({ _id: req.params.id, role: 'staff' }).select('name email isAvailable');
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found.' });

    const staffFilter = {
      $or: [{ assignedStaffId: staff._id }, { 'assignedTeam.staffId': staff._id }],
    };

    const project = (b) => ({
      _id:            b._id,
      bookingId:      b.bookingId,
      customerName:   b.customerName,
      serviceName:    b.serviceName,
      date:           b.date,
      time:           b.time,
      status:         b.status,
      assignedAt:     b.createdAt,
      completedAt:    b.completedAt,
    });

    const [assignedDocs, completedDocs, pendingDocs] = await Promise.all([
      Booking.find({ ...staffFilter, status: { $in: ACTIVE_STATUSES } }).sort({ date: 1, time: 1 }),
      Booking.find({ ...staffFilter, status: 'completed' }).sort({ completedAt: -1 }),
      Booking.find({ ...staffFilter, status: { $in: ['pending', 'confirmed'] } }).sort({ date: 1, time: 1 }),
    ]);

    res.json({
      success: true,
      staff: { staffId: staff._id, name: staff.name, email: staff.email, isAvailable: staff.isAvailable },
      assignedTasks:  assignedDocs.map(project),
      completedTasks: completedDocs.map(project),
      pendingTasks:   pendingDocs.map(project),
    });
  } catch (err) {
    console.error('getStaffTaskDetails error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  requestUnavailability,
  endUnavailability,
  getMyPendingAvailabilityRequest,
  getAvailabilityRequests,
  approveAvailabilityRequest,
  rejectAvailabilityRequest,
  getDeclineRequests,
  approveDeclineRequest,
  rejectDeclineRequest,
  getPendingCounts,
  getStaffOverview,
  getStaffTaskDetails,
};
