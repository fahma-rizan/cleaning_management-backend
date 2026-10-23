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

  // Despite the schema typing bookingId as an ObjectId ref, pre-existing
  // complaint documents in this database actually store the readable
  // "BK-..." code as a plain string (e.g. bookingId: 'BK-1786779694685'),
  // not a Mongo _id. Booking.findById() on a value like that either threw
  // a CastError (crashing the whole list) or, after the last fix, got
  // skipped outright — which is why the booking info went blank instead
  // of just failing to match. Resolving it the same dual-format way
  // createComplaint/createReview already do — by _id when the value looks
  // like one, otherwise by the Booking's own bookingId field — picks it
  // up correctly either way.
  const rawBookingId = obj.bookingId ? String(obj.bookingId) : null;
  const isObjectIdFormat = rawBookingId && /^[0-9a-fA-F]{24}$/.test(rawBookingId);

  const [customer, booking] = await Promise.all([
    User.findById(obj.customerId).select('email phone'),
    rawBookingId
      ? (isObjectIdFormat ? Booking.findById(rawBookingId) : Booking.findOne({ bookingId: rawBookingId }))
      : null,
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
    // Show the booking's own readable code when we resolved a booking;
    // otherwise fall back to whatever was already stored on the complaint
    // (still better than showing nothing) rather than blanking it out.
    bookingId: booking ? booking.bookingId : rawBookingId,
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || '',
    serviceStaffName,
    assignedStaffName: obj.assignedStaffName || serviceStaffName,
    assignedStaffId: storedStaffId ? String(storedStaffId) : defaultStaffId,
    paidAmount,
    serviceDate,
  };
};

// ─── GET /api/complaints/assigned ────────────────────────────────────────────
// Staff: complaints currently assigned to them for resolution.
const getAssignedComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ assignedStaffId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    const enriched = await Promise.all(complaints.map(enrichComplaint));
    res.json({ success: true, complaints: enriched });
  } catch (err) {
    console.error('getAssignedComplaints error:', err);
    res.status(500).json({ success: false, message: 'Failed to load assigned complaints' });
  }
};

// ─── PUT /api/complaints/:id/staff-status ────────────────────────────────────
// Staff can move a complaint assigned to them forward: Pending -> In
// Progress -> Resolved. Cannot reassign, change priority, or move a
// complaint backward — those stay admin-only via the existing /status route.
const updateStatusByStaff = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    if (String(complaint.assignedStaffId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'This complaint is not assigned to you' });
    }

    complaint.status = status;
    await complaint.save();
    res.json({ success: true, complaint });
  } catch (err) {
    console.error('updateStatusByStaff error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
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
    // .lean() here is required, not just a perf nicety: the schema types
    // bookingId as ObjectId, but pre-existing documents in this database
    // store it as a plain "BK-..." string. Without .lean(), Mongoose
    // hydrates a full Document and casts every field against the schema
    // on the way — that cast fails silently for these records and drops
    // bookingId to undefined before enrichComplaint ever sees it, no
    // matter what lookup logic enrichComplaint has. .lean() returns the
    // raw stored value untouched.
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).lean();
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
    const complaint = await Complaint.findById(req.params.id).lean();
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
  getAssignedComplaints, updateStatusByStaff,
};