const Staff = require('../models/User');
const Booking = require('../models/Booking');
const { getStaffRatingStats, getStaffJobCounts } = require('../utils/staffStats');

exports.getAll = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = { role: 'staff' };
    if (status && status !== 'All') filter.staffStatus = status;
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { nic:   { $regex: search, $options: 'i' } },
    ];
    const staff = await Staff.find(filter).sort({ createdAt: -1 });
    const staffIds = staff.map((s) => s._id);
    const statsByStaffId = await getStaffRatingStats(staffIds);
    const jobCountsByStaffId = await getStaffJobCounts(staffIds);

    const enriched = staff.map((s) => {
      const stats = statsByStaffId.get(String(s._id));
      return {
        ...s.toObject(),
        rating: stats ? Math.round(stats.avgRating * 10) / 10 : 0,
        jobsCompleted: jobCountsByStaffId.get(String(s._id)) || 0,
      };
    });

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getAvailable = async (req, res) => {
  try {
    // staffStatus was added to the schema after some staff accounts
    // already existed, so older records (like ones from before this
    // field existed) never got it backfilled and simply don't have it.
    // Treat a staff member as active if staffStatus explicitly says so,
    // OR if that field is missing entirely but isActive is true — so
    // legacy accounts aren't silently excluded.
    const staff = await Staff.find({
      role: 'staff',
      $or: [
        { staffStatus: 'Active' },
        { staffStatus: { $exists: false }, isActive: true },
      ],
    }).sort({ name: 1 });
    res.json(staff);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getById = async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const statsByStaffId = await getStaffRatingStats([staff._id]);
    const stats = statsByStaffId.get(String(staff._id));

    // Completed jobs this staff worked on — as the primary assignee or as
    // part of the team. Each job is tagged Solo/Group depending on how
    // many staff total were on that booking, so the UI can show which.
    const bookings = await Booking.find({
      status: 'completed',
      $or: [
        { assignedStaffId: staff._id },
        { 'assignedTeam.staffId': staff._id },
      ],
    }).sort({ completedAt: -1, createdAt: -1 }).lean();

    const completedJobs = bookings.map((b) => {
      const teamIds = new Set(
        [b.assignedStaffId, ...(b.assignedTeam || []).map((t) => t.staffId)]
          .filter(Boolean)
          .map(String),
      );
      return {
        bookingId: b.bookingId,
        service: b.serviceCategory || b.serviceType || b.serviceName || '—',
        customerName: b.customerName || '—',
        date: b.completedAt
          ? new Date(b.completedAt).toISOString().split('T')[0]
          : (b.date || (b.createdAt ? new Date(b.createdAt).toISOString().split('T')[0] : '')),
        jobType: teamIds.size > 1 ? 'Group' : 'Solo',
      };
    });

    res.json({
      ...staff.toObject(),
      rating: stats ? Math.round(stats.avgRating * 10) / 10 : 0,
      jobsCompleted: completedJobs.length,
      completedJobs,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.create = async (req, res) => {
  try {
    const { name, email, phone, nic, address, specializations, status, password } = req.body;
    let specs = [];
    if (specializations) specs = typeof specializations === 'string' ? JSON.parse(specializations) : specializations;
    const profilePhoto = req.file ? req.file.path : '';

    const [firstName, ...rest] = name.trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    const staff = await Staff.create({
      firstName, lastName, email, phone, nic,
      password: password || 'Default@123', // pre('save') hook hashes this
      address: address || '',
      specializations: specs,
      staffStatus: status || 'Active',
      profilePhoto,
      role: 'staff',
      createdBy: req.admin.id,
    });
    const obj = staff.toObject();
    delete obj.password;
    res.status(201).json(obj);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ error: `${field} already exists` });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    const { address, specializations, status, phone } = req.body;
    let specs = staff.specializations;
    if (specializations) specs = typeof specializations === 'string' ? JSON.parse(specializations) : specializations;
    const updateData = {
      address: address || staff.address,
      specializations: specs,
      staffStatus: status || staff.staffStatus,
      phone: phone || staff.phone,
    };
    if (req.file) updateData.profilePhoto = req.file.path;
    const updated = await Staff.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.deactivate = async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    await Staff.findByIdAndUpdate(req.params.id, { staffStatus: 'Inactive' });
    res.json({ message: 'Staff deactivated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.activate = async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    await Staff.findByIdAndUpdate(req.params.id, { staffStatus: 'Active' });
    res.json({ message: 'Staff activated' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.remove = async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    await Staff.findByIdAndDelete(req.params.id);
    res.json({ message: 'Staff deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};