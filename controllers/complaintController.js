const Complaint = require('../models/Complaint');
const User      = require('../models/User');
const Booking   = require('../models/Booking');

// Pulls in everything the complaint document doesn't store itself: the
// customer's live contact info, and the booking's paid amount and actual
// completion date. Ported from feature/admin-reviews-complaints — the
// admin ComplaintsManagement.tsx UI already reads these fields, but this
// backend never enriched the response with them.
//
// Two different "staff" concerns get kept separate here:
//  - serviceStaffName: who actually performed the booking (recomputed
//    fresh from the booking's team every time — purely informational).
//  - assignedStaffName/assignedStaffId: who is currently assigned to
//    *handle this complaint*, set via the "Assign to" dropdown. This must
//    stay whatever was last manually assigned — it is NOT recomputed from
//    the booking. If nobody has been assigned yet, it defaults to the
//    booking's staff (same as at complaint-creation time) purely as a
//    sensible starting point for the dropdown.
const enrichComplaint = async (complaint) => {
  const obj = complaint.toObject ? complaint.toObject() : complaint;

  const [customer, booking] = await Promise.all([
    User.findById(obj.customerId).select('email phone'),
    obj.bookingId ? Booking.findById(obj.bookingId) : null,
  ]);

  let serviceStaffName = '';
  let defaultStaffId = '';
  let paidAmount = 0;
  let serviceDate = obj.serviceDate;

  if (booking) {
    const names = [];
    if (booking.assignedStaffName) names.push(booking.assignedStaffName);
    if (booking.assignedTeam && booking.assignedTeam.length > 0) {
      booking.assignedTeam.forEach((m) => {
        if (m.staffName && !names.includes(m.staffName)) names.push(m.staffName);
      });
    }
    serviceStaffName = names.join(', ');

    defaultStaffId = booking.assignedStaffId
      ? String(booking.assignedStaffId)
      : (booking.assignedTeam?.[0]?.staffId ? String(booking.assignedTeam[0].staffId) : '');

    paidAmount = booking.paidAmount || 0;
    serviceDate = booking.completedAt || (booking.date ? new Date(booking.date) : obj.serviceDate);
  }

  // Some pre-existing complaint documents were written by an older code path
  // that stored the assigned staff under `assignedStaff` instead of the
  // current `assignedStaffId` — fall back to it so already-assigned staff
  // don't silently disappear from the admin UI.
  const storedStaffId = obj.assignedStaffId || obj.assignedStaff;

  return {
    ...obj,
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || '',
    serviceStaffName,
    assignedStaffName: obj.assignedStaffName || serviceStaffName,
    assignedStaffId: storedStaffId ? String(storedStaffId) : defaultStaffId,
    paidAmount,
    serviceDate,
  };
};

// ─── POST /api/complaints ──────────────────────────────────────────────────────────
// Customer submits a complaint for one of their own completed bookings.
const createComplaint = async (req, res) => {
  try {
    const { bookingId, title, description, priority } = req.body;
    const customerId = req.user._id;

    if (!bookingId || !title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'bookingId, title and description are required' });
    }

    const booking = /^[0-9a-fA-F]{24}$/.test(bookingId)
      ? await Booking.findById(bookingId)
      : await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (String(booking.customerId) !== String(customerId)) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }
    if ((booking.status || '').toLowerCase() !== 'completed') {
      return res.status(400).json({ error: 'You can only submit a complaint for completed bookings' });
    }

    const assignedStaffName = booking.assignedTeam && booking.assignedTeam.length > 0
      ? booking.assignedTeam.map(m => m.staffName).filter(Boolean).join(', ')
      : (booking.assignedStaffName || '');

    const serviceDate = booking.date ? new Date(booking.date) : new Date();

    const complaint = await Complaint.create({
      bookingId:    booking._id,
      title:        title.trim(),
      description:  description.trim(),
      customerId,
      customerName: booking.customerName || req.user.name || 'Customer',
      serviceName:  booking.serviceName || booking.serviceType,
      serviceDate:  isNaN(serviceDate.getTime()) ? new Date().toISOString() : serviceDate.toISOString(),
      assignedStaffName,
      priority: ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium',
      status: 'Pending',
    });

    res.status(201).json(complaint);
  } catch (err) {
    console.error('createComplaint error:', err);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
};

// ─── GET /api/complaints ──────────────────────────────────────────────────────────
const getAllComplaints = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (search) {
      filter.$or = [
        { title:        { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { serviceName:  { $regex: search, $options: 'i' } },
      ];
    }
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
    const enriched = await Promise.all(complaints.map(enrichComplaint));
    res.json(enriched);
  } catch (err) {
    console.error('getAllComplaints error:', err);
    res.status(500).json({ error: 'Failed to load complaints' });
  }
};

// ─── GET /api/complaints/:id ───────────────────────────────────────────────────────
const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    const enriched = await enrichComplaint(complaint);
    res.json(enriched);
  } catch (err) {
    console.error('getComplaintById error:', err);
    res.status(500).json({ error: 'Failed to load complaint' });
  }
};

// ─── PUT /api/complaints/:id/status ─────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

// ─── PUT /api/complaints/:id/priority ───────────────────────────────────────────────
const updatePriority = async (req, res) => {
  try {
    const { priority } = req.body;
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { priority }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    console.error('updatePriority error:', err);
    res.status(500).json({ error: 'Failed to update priority' });
  }
};

// ─── PUT /api/complaints/:id/assign ─────────────────────────────────────────────────
const assignStaff = async (req, res) => {
  try {
    const { staffId } = req.body;
    const staff = await User.findOne({ _id: staffId, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { assignedStaffId: staff._id, assignedStaffName: staff.name },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    console.error('assignStaff error:', err);
    res.status(500).json({ error: 'Failed to assign staff' });
  }
};

// ─── POST /api/complaints/:id/notes ─────────────────────────────────────────────────
const addNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Note text is required' });

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { $push: { notes: { adminName: req.body.adminName || 'Admin', note, createdAt: new Date() } } },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    console.error('addNote error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
};

module.exports = {
  createComplaint, getAllComplaints, getComplaintById, updateStatus, updatePriority, assignStaff, addNote,
};
