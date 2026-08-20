const Complaint = require('../models/Complaint');
const StaffUser = require('../models/User');
const Customer  = require('../models/User');
const Booking   = require('../models/Booking');

// Pulls in everything the complaint document doesn't store itself: the
// customer's live contact info, and the booking's paid amount and actual
// completion date.
//
// Two different "staff" concerns get kept separate here:
//  - serviceStaffName: who actually performed the booking (recomputed
//    fresh from the booking's team every time — purely informational).
//  - assignedStaffName / assignedStaff: who is currently assigned to
//    *handle this complaint*, set via the "Assign to" dropdown. This must
//    stay whatever was last manually assigned — it is NOT recomputed from
//    the booking. If nobody has been assigned yet, it defaults to the
//    booking's staff (same as at complaint-creation time) purely as a
//    sensible starting point for the dropdown.
const enrichComplaint = async (complaint) => {
  const obj = complaint.toObject ? complaint.toObject() : complaint;

  const [customer, booking] = await Promise.all([
    Customer.findById(obj.customerId).select('email phone'),
    Booking.findOne({ bookingId: obj.bookingId }),
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

  return {
    ...obj,
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || '',
    serviceStaffName,
    assignedStaffName: obj.assignedStaffName || serviceStaffName,
    assignedStaff: obj.assignedStaff ? String(obj.assignedStaff) : defaultStaffId,
    paidAmount,
    serviceDate,
  };
};

exports.create = async (req, res) => {
  try {
    const { bookingId, title, description, priority } = req.body;
    const customerId = req.admin.id;

    if (!bookingId || !title || !title.trim() || !description || !description.trim()) {
      return res.status(400).json({ error: 'bookingId, title and description are required' });
    }

    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (String(booking.customerId) !== String(customerId)) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }

    const normalizedStatus = (booking.status || '').toLowerCase();
    if (normalizedStatus !== 'completed') {
      return res.status(400).json({ error: 'You can only submit a complaint for completed bookings' });
    }

    const assignedStaffName = booking.assignedTeam && booking.assignedTeam.length > 0
      ? booking.assignedTeam.map(m => m.staffName).filter(Boolean).join(', ')
      : (booking.assignedStaffName || '');

    const serviceDate = new Date(booking.date);

    const complaint = await Complaint.create({
      bookingId,
      title: title.trim(),
      description: description.trim(),
      customerId,
      customerName: booking.customerName || 'Customer',
      serviceName: booking.serviceType || booking.serviceName,
      serviceDate: isNaN(serviceDate.getTime()) ? new Date() : serviceDate,
      assignedStaffName,
      priority: ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium',
      status: 'Pending',
    });

    res.status(201).json(complaint);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getAll = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (search) filter.$or = [
      { title:        { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
      { serviceName:  { $regex: search, $options: 'i' } },
    ];
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
    const enriched = await Promise.all(complaints.map(enrichComplaint));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    const enriched = await enrichComplaint(complaint);
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'In Progress', 'Resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.updatePriority = async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['High', 'Medium', 'Low'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: { priority } }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.assign = async (req, res) => {
  try {
    const { staffId } = req.body;
    const staff = await StaffUser.findOne({ _id: staffId, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: { assignedStaff: staffId, assignedStaffName: staff.name } }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.addNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Note is required' });
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $push: { notes: { adminId: req.admin.id, adminName: req.admin.email, note, createdAt: new Date() } } }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};