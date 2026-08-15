const User    = require('../models/User');
const Booking = require('../models/Booking');
const bcrypt  = require('bcryptjs');
const { getTodayLocalStr } = require('../utils/dateUtils');

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in-progress'];

// ─── PATCH /api/staff/availability ───────────────────────────────────────────
// Staff toggles their own availability on/off.
// Going unavailable auto-removes them from all active booking teams and attempts
// to find replacements; bookings with no replacement are flagged for admin.
const toggleAvailability = async (req, res) => {
  try {
    const staff = await User.findById(req.user._id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });

    staff.isAvailable = !staff.isAvailable;
    staff.availabilityLogs.push({
      status:    staff.isAvailable ? 'available' : 'unavailable',
      changedAt: new Date(),
    });
    await staff.save();

    if (!staff.isAvailable) {
      // isAvailable is today-only — only reassign TODAY's bookings.
      // Future bookings remain assigned (staff will be available on those dates).
      const todayStr = getTodayLocalStr();

      // ── Handle team bookings for today ──────────────────────────────────────
      const teamBookings = await Booking.find({
        'assignedTeam.staffId': staff._id,
        status: { $in: ACTIVE_STATUSES },
        date:   todayStr,
      });

      for (const booking of teamBookings) {
        booking.assignedTeam = booking.assignedTeam.filter(
          m => m.staffId.toString() !== staff._id.toString()
        );

        const currentTeamIds = booking.assignedTeam.map(m => m.staffId);
        const candidates = await User.find({
          role:        'staff',
          isAvailable: true,
          _id:         { $nin: [...currentTeamIds, staff._id] },
        });

        if (candidates.length > 0) {
          let minLoad = Infinity;
          let chosen  = candidates[0];
          for (const c of candidates) {
            const load = await Booking.countDocuments({
              $or: [
                { assignedStaffId:        c._id },
                { 'assignedTeam.staffId': c._id },
              ],
              status: { $in: ACTIVE_STATUSES },
            });
            if (load < minLoad) { minLoad = load; chosen = c; }
          }
          booking.assignedTeam.push({
            staffId:    chosen._id,
            staffName:  chosen.name,
            staffEmail: chosen.email,
          });
          booking.needsAdminAttention     = false;
          booking.adminNotificationReason = '';
        } else {
          booking.needsAdminAttention     = true;
          booking.adminNotificationReason = `Team member ${staff.name} became unavailable. No replacement found.`;
        }

        await booking.save();
      }

      // ── Handle legacy single-staff bookings ─────────────────────────────────
      const singleBookings = await Booking.find({
        assignedStaffId: staff._id,
        status:          { $in: ACTIVE_STATUSES },
        $or: [
          { assignedTeam: { $exists: false } },
          { assignedTeam: { $size: 0 } },
        ],
      });

      for (const booking of singleBookings) {
        const candidates = await User.find({
          role:        'staff',
          isAvailable: true,
          _id:         { $ne: staff._id },
        });

        if (candidates.length > 0) {
          let minLoad = Infinity;
          let chosen  = candidates[0];
          for (const c of candidates) {
            const load = await Booking.countDocuments({
              assignedStaffId: c._id,
              status:          { $in: ACTIVE_STATUSES },
            });
            if (load < minLoad) { minLoad = load; chosen = c; }
          }
          booking.assignedStaffId    = chosen._id;
          booking.assignedStaffName  = chosen.name;
          booking.assignedStaffEmail = chosen.email;
          booking.needsAdminAttention     = false;
          booking.adminNotificationReason = '';
        } else {
          booking.needsAdminAttention     = true;
          booking.adminNotificationReason = `Assigned staff ${staff.name} became unavailable. No replacement found.`;
        }

        await booking.save();
      }
    }

    res.json({ success: true, isAvailable: staff.isAvailable });
  } catch (err) {
    console.error('toggleAvailability error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── POST /api/staff/create  (admin only) ────────────────────────────────────
// Admin creates a new staff account with temp password staff123
const createStaff = async (req, res) => {
  try {
    const { fullName, email, phone, nic, address, specifications, status } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Full name, email and phone are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const nameParts  = fullName.trim().split(' ');
    const firstName  = nameParts[0];
    const lastName   = nameParts.slice(1).join(' ') || firstName;

    const newStaff = await User.create({
      firstName,
      lastName,
      name:                  fullName.trim(),
      email:                 email.toLowerCase(),
      phone,
      nic:                   nic   || '',
      address:               address || '',
      password:              'staff123',      // temporary — must change on first login
      role:                  'staff',
      isVerified:            true,
      requiresPasswordChange: true,
      isAvailable:           status === 'Active',
      specializations:       specifications || [],
    });

    res.status(201).json({
      success: true,
      message: `Staff account created. Temporary password is: staff123`,
      staff: {
        _id:         newStaff._id,
        name:        newStaff.name,
        email:       newStaff.email,
        phone:       newStaff.phone,
        isAvailable: newStaff.isAvailable,
        specializations: newStaff.specializations,
      },
    });
  } catch (err) {
    console.error('createStaff error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff/all  (admin only) ────────────────────────────────────────
// Returns all staff with their availability, logs, and completed job counts
const getAllStaff = async (req, res) => {
  try {
    const staffList = await User.find({ role: 'staff' })
      .select('name email phone isAvailable availabilityLogs role specializations');

    // Attach completed job count to each staff member
    const staffWithJobs = await Promise.all(
      staffList.map(async (s) => {
        const jobsCount = await Booking.countDocuments({
          assignedStaffId: s._id,
          status: 'completed',
        });
        return { ...s.toObject(), jobsCount };
      })
    );

    // Build staffStatuses map: { email: boolean }
    const staffStatuses = {};
    staffList.forEach(s => { staffStatuses[s.email] = s.isAvailable; });

    // Build flat status log array sorted newest first
    const statusLogs = [];
    staffList.forEach(s => {
      s.availabilityLogs.forEach(log => {
        const d = new Date(log.changedAt);
        statusLogs.push({
          staffEmail: s.email,
          staffName:  s.name,
          status:     log.status,
          timestamp:  log.changedAt,
          date:       d.toLocaleDateString(),
          time:       d.toLocaleTimeString(),
        });
      });
    });
    statusLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ success: true, staffStatuses, statusLogs, staffList: staffWithJobs });
  } catch (err) {
    console.error('getAllStaff error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff/performance ──────────────────────────────────────────────
// Returns performance stats for the logged-in staff member
const getMyPerformance = async (req, res) => {
  try {
    const staffId = req.user._id;

    const allBookings       = await Booking.find({ assignedStaffId: staffId });
    const completedBookings = allBookings.filter(b => b.status === 'completed');
    const pendingBookings   = allBookings.filter(b =>
      ['pending', 'confirmed', 'in-progress'].includes(b.status)
    );

    const totalEarnings  = completedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
    const completionRate = allBookings.length > 0
      ? Math.round((completedBookings.length / allBookings.length) * 100)
      : 0;

    // Monthly breakdown for the current year
    const currentYear = new Date().getFullYear();
    const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyData = monthNames.map((month, idx) => {
      const monthBookings = completedBookings.filter(b => {
        const d = new Date(b.taskCompletedAt || b.updatedAt);
        return d.getFullYear() === currentYear && d.getMonth() === idx;
      });
      return {
        month,
        tasks:    monthBookings.length,
        earnings: monthBookings.reduce((sum, b) => sum + (b.price || 0), 0),
      };
    });

    res.json({
      success: true,
      stats: {
        totalTasks:      allBookings.length,
        completedTasks:  completedBookings.length,
        pendingTasks:    pendingBookings.length,
        totalEarnings,
        completionRate,
        avgRating:       4.8,  // placeholder — reviews module is another workload
        onTimeDelivery:  97,
      },
      monthlyData,
      recentReviews: [],
    });
  } catch (err) {
    console.error('getMyPerformance error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff/reassignments  (admin only) ──────────────────────────────
// Returns declined tasks and reassignment info for the admin panel

// For team bookings the replacement is the member whose ObjectId timestamp
// (first 4 bytes) falls after the decline — that is when they were added.
// For single-staff bookings assignedStaffId/Name/Email already holds the
// replacement directly.
const findReplacement = (booking, decline) => {
  const isTeam = booking.assignedTeam && booking.assignedTeam.length > 0;
  if (!isTeam) {
    return { staffEmail: booking.assignedStaffEmail || '', staffName: booking.assignedStaffName || '' };
  }

  const declineTime    = decline.declinedAt ? new Date(decline.declinedAt).getTime() : 0;
  const declinerIdStr  = decline.staffId ? decline.staffId.toString() : '';

  let replacement  = null;
  let closestDelta = Infinity;

  for (const member of booking.assignedTeam) {
    if (member.staffId.toString() === declinerIdStr) continue;
    // ObjectId first 4 bytes = seconds since Unix epoch
    const addedAtMs = parseInt(member._id.toString().substring(0, 8), 16) * 1000;
    const delta     = addedAtMs - declineTime;
    if (delta > 0 && delta < closestDelta) {
      closestDelta = delta;
      replacement  = member;
    }
  }

  return replacement
    ? { staffEmail: replacement.staffEmail, staffName: replacement.staffName }
    : { staffEmail: booking.assignedStaffEmail || '', staffName: booking.assignedStaffName || '' };
};

const getReassignmentData = async (req, res) => {
  try {
    const bookingsWithDeclines = await Booking.find({ 'declineHistory.0': { $exists: true } })
      .sort({ updatedAt: -1 })
      .limit(100);

    const declinedTasks   = [];
    const reassignments   = [];
    const notifications   = [];

    bookingsWithDeclines.forEach(booking => {
      booking.declineHistory.forEach((decline, idx) => {
        const declinedAt  = new Date(decline.declinedAt);
        const wasReassigned = !!booking.assignedStaffId;
        const taskId      = booking.bookingId || booking._id.toString();
        const service     = booking.serviceName || booking.serviceCategory || 'Service';
        const customer    = booking.customerName || 'Customer';

        declinedTasks.push({
          id:            taskId,
          customer,
          service,
          date:          booking.date   || '',
          time:          booking.time   || '',
          address:       booking.address || '',
          amount:        booking.price   || 0,
          declinedBy:    decline.staffEmail || '',
          declinedByName: decline.staffName || '',
          declineReason: decline.reason  || '',
          declinedAt:    decline.declinedAt,
          declinedDate:  declinedAt.toLocaleDateString(),
          declinedTime:  declinedAt.toLocaleTimeString(),
          status:        wasReassigned ? 'reassigned' : 'pending-reassignment',
        });

        if (wasReassigned) {
          const replacement = findReplacement(booking, decline);

          reassignments.push({
            taskId,
            originalStaff:     decline.staffEmail || '',
            originalStaffName: decline.staffName  || '',
            newStaff:          replacement.staffEmail,
            newStaffName:      replacement.staffName,
            reason:            decline.reason || '',
            reassignedAt:      decline.declinedAt,
            reassignedDate:    declinedAt.toLocaleDateString(),
            reassignedTime:    declinedAt.toLocaleTimeString(),
            taskDetails: {
              service, customer,
              date:    booking.date    || '',
              time:    booking.time    || '',
              address: booking.address || '',
              amount:  booking.price   || 0,
            },
            status: 'completed',
          });

          notifications.push({
            id:            `NOTIF-${booking._id}-${idx}`,
            type:          'task-reassigned',
            taskId,
            originalStaff: decline.staffName,
            newStaff:      replacement.staffName,
            reason:        decline.reason,
            customer,      service,
            date:          booking.date || '',
            time:          booking.time || '',
            message:       `Task ${taskId} automatically reassigned from ${decline.staffName} to ${replacement.staffName}`,
            timestamp:     decline.declinedAt,
            notificationDate: declinedAt.toLocaleDateString(),
            notificationTime: declinedAt.toLocaleTimeString(),
            status: 'unread',
          });
        } else {
          notifications.push({
            id:         `NOTIF-${booking._id}-${idx}`,
            type:       'task-declined-no-staff',
            taskId,
            declinedBy: decline.staffName,
            reason:     decline.reason,
            customer,   service,
            date:       booking.date || '',
            time:       booking.time || '',
            message:    `Task ${taskId} declined by ${decline.staffName}. No available staff for reassignment.`,
            timestamp:  decline.declinedAt,
            notificationDate: declinedAt.toLocaleDateString(),
            notificationTime: declinedAt.toLocaleTimeString(),
            status: 'unread',
          });
        }
      });
    });

    res.json({ success: true, declinedTasks, reassignments, notifications });
  } catch (err) {
    console.error('getReassignmentData error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/staff/me ───────────────────────────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const staff = await User.findById(req.user._id)
      .select('name email phone nic address specializations profilePhoto isAvailable role');
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });
    res.json({ success: true, staff });
  } catch (err) {
    console.error('getMyProfile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/staff/profile ────────────────────────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    const { fullName, phone, address, specializations, profilePhoto } = req.body;
    const staff = await User.findById(req.user._id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });

    if (fullName && fullName.trim()) {
      const parts     = fullName.trim().split(' ');
      staff.firstName = parts[0];
      staff.lastName  = parts.slice(1).join(' ') || parts[0];
    }
    if (phone        !== undefined) staff.phone          = phone;
    if (address      !== undefined) staff.address        = address;
    if (specializations !== undefined) staff.specializations = specializations;
    if (profilePhoto !== undefined) staff.profilePhoto   = profilePhoto;

    await staff.save();

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id:              staff._id,
        name:            staff.name,
        email:           staff.email,
        role:            staff.role,
        phone:           staff.phone,
        address:         staff.address,
        nic:             staff.nic,
        specializations: staff.specializations,
        image:           staff.profilePhoto,
        requiresPasswordChange: staff.requiresPasswordChange,
      },
    });
  } catch (err) {
    console.error('updateMyProfile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Admin panel v2 (feature/admin-dashboard) ────────────────────────────────
// A separate, simpler staff CRUD surface used by the new admin panel:
// GET/POST /api/staff, PUT /api/staff/:id, /:id/deactivate, /:id/activate,
// DELETE /api/staff/:id — distinct paths from the routes above so nothing
// that already depends on /api/staff/all etc. is touched.

const toStaffMember = (s) => ({
  _id:            s._id,
  name:           s.name,
  email:          s.email,
  phone:          s.phone || '',
  nic:            s.nic || '',
  address:        s.address || '',
  specifications: s.specializations || [],
  rating:         s.rating || 0,
  jobsCompleted:  s.jobsCompleted || 0,
  staffStatus:    s.isAvailable ? 'Active' : 'Inactive',
  profilePhoto:   s.profilePhoto || '',
});

// ─── GET /api/staff ───────────────────────────────────────────────────────────
const getAllStaffV2 = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = { role: 'staff' };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (status && status !== 'All') filter.isAvailable = status === 'Active';

    const staffList = await User.find(filter);
    res.json(staffList.map(toStaffMember));
  } catch (err) {
    console.error('getAllStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to load staff' });
  }
};

// ─── GET /api/staff/:id ───────────────────────────────────────────────────────
const getStaffByIdV2 = async (req, res) => {
  try {
    const staff = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(toStaffMember(staff));
  } catch (err) {
    console.error('getStaffByIdV2 error:', err);
    res.status(500).json({ error: 'Failed to load staff member' });
  }
};

// ─── GET /api/staff/available ─────────────────────────────────────────────────
const getAvailableStaffV2 = async (req, res) => {
  try {
    const staffList = await User.find({ role: 'staff', isAvailable: true });
    res.json(staffList.map(toStaffMember));
  } catch (err) {
    console.error('getAvailableStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to load available staff' });
  }
};

// ─── POST /api/staff (multipart/form-data) ────────────────────────────────────
const createStaffV2 = async (req, res) => {
  try {
    const { name, email, phone, nic, address, specifications, status } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email and phone are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const nameParts = name.trim().split(' ');
    let parsedSpecs = [];
    try { parsedSpecs = specifications ? JSON.parse(specifications) : []; } catch { parsedSpecs = []; }

    const staff = await User.create({
      firstName: nameParts[0],
      lastName:  nameParts.slice(1).join(' ') || nameParts[0],
      name:      name.trim(),
      email:     email.toLowerCase(),
      phone,
      nic:       nic     || '',
      address:   address || '',
      password:  'staff123',
      role:      'staff',
      isVerified: true,
      requiresPasswordChange: true,
      isAvailable: status !== 'Inactive',
      specializations: parsedSpecs,
      profilePhoto: req.file ? `/uploads/staff/${req.file.filename}` : '',
    });

    res.status(201).json(toStaffMember(staff));
  } catch (err) {
    console.error('createStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to create staff' });
  }
};

// ─── PUT /api/staff/:id (multipart/form-data) ─────────────────────────────────
const updateStaffV2 = async (req, res) => {
  try {
    const staff = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const { name, email, phone, nic, address, specifications, status } = req.body;
    if (name) {
      const parts = name.trim().split(' ');
      staff.firstName = parts[0];
      staff.lastName  = parts.slice(1).join(' ') || parts[0];
      staff.name      = name.trim();
    }
    if (email)   staff.email   = email.toLowerCase();
    if (phone)   staff.phone   = phone;
    if (nic !== undefined)     staff.nic     = nic;
    if (address !== undefined) staff.address = address;
    if (specifications !== undefined) {
      try { staff.specializations = JSON.parse(specifications); } catch { /* keep existing */ }
    }
    if (status !== undefined) staff.isAvailable = status !== 'Inactive';
    if (req.file) staff.profilePhoto = `/uploads/staff/${req.file.filename}`;

    await staff.save();
    res.json(toStaffMember(staff));
  } catch (err) {
    console.error('updateStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to update staff' });
  }
};

// ─── PUT /api/staff/:id/deactivate ─────────────────────────────────────────────
const deactivateStaffV2 = async (req, res) => {
  try {
    const staff = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'staff' }, { isAvailable: false }, { new: true }
    );
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(toStaffMember(staff));
  } catch (err) {
    console.error('deactivateStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to deactivate staff' });
  }
};

// ─── PUT /api/staff/:id/activate ───────────────────────────────────────────────
const activateStaffV2 = async (req, res) => {
  try {
    const staff = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'staff' }, { isAvailable: true }, { new: true }
    );
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(toStaffMember(staff));
  } catch (err) {
    console.error('activateStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to activate staff' });
  }
};

// ─── DELETE /api/staff/:id ────────────────────────────────────────────────────
const deleteStaffV2 = async (req, res) => {
  try {
    const staff = await User.findOneAndDelete({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteStaffV2 error:', err);
    res.status(500).json({ error: 'Failed to delete staff' });
  }
};

module.exports = {
  createStaff, toggleAvailability, getAllStaff, getMyPerformance, getReassignmentData, getMyProfile, updateMyProfile,
  getAllStaffV2, getStaffByIdV2, getAvailableStaffV2, createStaffV2, updateStaffV2, deactivateStaffV2, activateStaffV2, deleteStaffV2,
};
