const Complaint = require('../models/Complaint');
const User      = require('../models/User');

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
    res.json(complaints);
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
    res.json(complaint);
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
  getAllComplaints, getComplaintById, updateStatus, updatePriority, assignStaff, addNote,
};
