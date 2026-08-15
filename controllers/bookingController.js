const Booking   = require('../models/Booking');
const User      = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { getTodayLocalStr } = require('../utils/dateUtils');
const { awardPointsForBooking } = require('./loyaltyController');

const TIME_SLOTS = [
  '9:00AM - 11:00AM',
  '11:00AM - 1:00PM',
  '2:00PM - 4:00PM',
  '4:00PM - 6:00PM',
];

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in-progress'];

// Returns true if the service needs a team of 3 (Home Cleaning, Sofa/Mattress)
// Laundry and Curtain → single staff only
const requiresTeam = (booking) => {
  const text = [booking.serviceName, booking.serviceType, booking.serviceCategory]
    .filter(Boolean).join(' ').toLowerCase();
  return !(text.includes('laundry') || text.includes('curtain'));
};

// Maps service text to the closest specialization
const getRequiredSpecialization = (booking) => {
  const text = [booking.serviceName, booking.serviceType, booking.serviceCategory]
    .filter(Boolean).join(' ').toLowerCase();
  if (text.includes('laundry'))                                                      return 'Laundry Service';
  if (text.includes('sofa') || text.includes('mattress') || text.includes('carpet')) return 'Sofa/Mattress Cleaning';
  if (text.includes('curtain'))                                                      return 'Curtain Cleaning';
  return 'Home Cleaning';
};

// Pick `count` least-loaded staff from candidates (checks both single and team bookings)
//leastloaded
const pickLeastLoaded = async (candidates, count = 1) => {
  const withLoad = await Promise.all(candidates.map(async staff => {
    const load = await Booking.countDocuments({
      $or: [
        { assignedStaffId:        staff._id },
        { 'assignedTeam.staffId': staff._id },
      ],
      status: { $in: ACTIVE_STATUSES },
    });
    return { staff, load };
  }));
  withLoad.sort((a, b) => a.load - b.load);  // ascending = least loaded first
  return withLoad.slice(0, count).map(x => x.staff);
};

// Parses a time-slot string like "9:00AM - 11:00AM" and returns its start as 24-hour { h, m }
const parseSlotStartTime = (timeStr) => {
  const start = (timeStr || '').split(' - ')[0].trim();
  const match = start.match(/(\d+):(\d+)(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return { h, m };
};

// Builds the Date the booking is actually scheduled to start (server-local time)
const getScheduledDateTime = (booking) => {
  if (!booking.date || !booking.time) return null;
  const slot = parseSlotStartTime(booking.time);
  if (!slot) return null;
  const [year, month, day] = booking.date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, slot.h, slot.m, 0);
};

// Returns the set of staff IDs already assigned to any booking on the same date+time
// (excludes the booking itself so reschedule doesn't block its own staff)
const getBusyStaffIds = async (date, time, excludeBookingId = null) => {
  const filter = { date, time, status: { $in: ACTIVE_STATUSES } };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };

  const conflicts = await Booking.find(filter).select('assignedStaffId assignedTeam');
  const busy = new Set();
  conflicts.forEach(b => {
    if (b.assignedStaffId) busy.add(b.assignedStaffId.toString());
    (b.assignedTeam || []).forEach(m => busy.add(m.staffId.toString()));
  });
  return busy;
};

// Internal: assign a booking to staff (team of 3 or single depending on service)
// isAvailable is only relevant for TODAY. Future bookings can use any active staff.
const autoAssignBooking = async (booking) => {
  try {
    const isTeam   = requiresTeam(booking);
    const spec     = getRequiredSpecialization(booking);
    const todayStr = getTodayLocalStr();
    const isToday  = booking.date === todayStr;

    // For today → only available staff. For future → any active staff.
    const availFilter = isToday ? { isAvailable: true } : {};

    // Staff already assigned to another booking at the same date + time
    const busyIds = await getBusyStaffIds(booking.date, booking.time, booking._id);

    // Only assign spec-matched staff — never fall back to unqualified staff
    const candidates = await User.find({
      role:            'staff',
      specializations: spec,
      _id:             { $nin: [...busyIds] },
      ...availFilter,
    });
    //change staff count for team and single staff booking
    if (isTeam) {
      // Strictly require exactly 3 qualified staff — do not partially assign
      if (candidates.length < 3) {
        booking.needsAdminAttention     = true;
        booking.adminNotificationReason =
          `Not enough qualified staff (${spec}) for ${booking.date} at ${booking.time}. ` +
          `Need 3, only ${candidates.length} available. Others may be busy or lack this specialization.`;
        await booking.save();
        return;
      }

      //teambooking
      const chosen = await pickLeastLoaded(candidates, 3);
      booking.assignedTeam = chosen.map(s => ({
        staffId:    s._id,
        staffName:  s.name,
        staffEmail: s.email,
      }));
      booking.assignedStaffId    = chosen[0]._id;
      booking.assignedStaffName  = chosen[0].name;
      booking.assignedStaffEmail = chosen[0].email;
      booking.needsAdminAttention     = false;
      booking.adminNotificationReason = '';
    } else {
      // Single-staff service — must have the required specialization
      if (candidates.length === 0) {
        booking.needsAdminAttention     = true;
        booking.adminNotificationReason =
          `No qualified staff (${spec}) available for ${booking.date} at ${booking.time}. ` +
          `Staff may be busy at this time or lack this specialization.`;
        await booking.save();
        return;
      }

      //singlestaffbooking
      const chosen = await pickLeastLoaded(candidates, 1);
      booking.assignedStaffId    = chosen[0]._id;
      booking.assignedStaffName  = chosen[0].name;
      booking.assignedStaffEmail = chosen[0].email;
      booking.needsAdminAttention     = false;
      booking.adminNotificationReason = '';
    }

    await booking.save();
  } catch (err) {
    console.error('autoAssignBooking error:', err);
  }
};

// ─── POST /api/bookings ───────────────────────────────────────────────────────
const createBooking = async (req, res) => {
  try {
    const data = req.body;

    if (data.date && data.time) {
      const count = await Booking.countDocuments({
        date:   data.date,
        time:   data.time,
        status: { $nin: ['cancelled'] },
      });
      if (count >= 3) {
        return res.status(400).json({
          success: false,
          message: 'This time slot became fully booked. Please choose another time.',
        });
      }
    }

    const booking = await Booking.create({
      ...data,
      customerId:    req.user._id,
      customerName:  req.user.name,
      customerEmail: req.user.email,
    });

    await autoAssignBooking(booking);

    res.status(201).json({ success: true, booking });
  } catch (err) {
    console.error('createBooking error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/bookings/my ─────────────────────────────────────────────────────
const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ customerId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    console.error('getMyBookings error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── GET /api/bookings/assigned ──────────────────────────────────────────────
// Staff: returns all bookings they are part of (single or team)
const getAssignedBookings = async (req, res) => {
  try {
    const raw = await Booking.find({
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
      status: { $ne: 'cancelled' },
    }).sort({ date: 1, time: 1 });

    const bookings = raw.map(b => {
      const hasTeam = b.assignedTeam && b.assignedTeam.length > 0;
      return {
        _id:           b._id.toString(),
        id:            b._id.toString(),
        bookingId:     b.bookingId,
        customer:      b.customerName   || 'N/A',
        service:       b.serviceName    || b.serviceCategory || 'N/A',
        date:          b.date           || '',
        time:          b.time           || '',
        address:       b.address        || '',
        status:        b.status,
        amount:        b.price          || 0,
        paymentMethod: b.paymentMethod  || 'cod',
        customerEmail: b.customerEmail || '',
        cashReceived:  b.paymentStatus === 'paid',
        isTeam:        hasTeam,
        teamMembers:   hasTeam
          ? b.assignedTeam.map(m => ({
              staffId:    m.staffId.toString(),
              staffName:  m.staffName,
              staffEmail: m.staffEmail,
            }))
          : [],
      };
    });

    const me = await User.findById(req.user._id).select('isAvailable');
    res.json({ success: true, bookings, isAvailable: me?.isAvailable ?? true });
  } catch (err) {
    console.error('getAssignedBookings error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/bookings/slot-check?date=YYYY-MM-DD ────────────────────────────
const checkSlotAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });

    const slotCounts = {};
    for (const slot of TIME_SLOTS) {
      slotCounts[slot] = await Booking.countDocuments({
        date,
        time:   slot,
        status: { $nin: ['cancelled'] },
      });
    }
    res.json({ success: true, slotCounts });
  } catch (err) {
    console.error('checkSlotAvailability error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// reschedulefunction─── PATCH /api/bookings/:id/reschedule ──────────────────────────
const rescheduleBooking = async (req, res) => {
  try {
    const { date, time } = req.body;
    const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (['cancelled', 'completed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Cannot reschedule a cancelled or completed booking.' });
    }

    // Check the new slot is not already full (max 3 bookings per slot)
    const count = await Booking.countDocuments({
      date, time,
      status: { $nin: ['cancelled'] },
      _id:    { $ne: booking._id },
    });
    if (count >= 3) {
      return res.status(400).json({ success: false, message: 'That time slot is fully booked. Please choose a different time.' });
    }
    
    //update date and time
    booking.date = date;
    booking.time = time;

    // Clear old assignment and decline history — fresh start on the new date
    booking.assignedTeam           = [];
    booking.assignedStaffId        = undefined;
    booking.assignedStaffName      = undefined;
    booking.assignedStaffEmail     = undefined;
    booking.declineHistory         = [];
    booking.needsAdminAttention    = false;
    booking.adminNotificationReason = '';

    await booking.save();

    // Re-assign staff based on the new date's availability
    await autoAssignBooking(booking);

    // Return the updated booking with team info
    const updated = await Booking.findById(booking._id);
    res.json({ success: true, booking: updated });
  } catch (err) {
    console.error('rescheduleBooking error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// cancelBookingfunction─── PATCH /api/bookings/:id/cancel ────────────────────────────
// Requires a cancellation reason (Uber-style). Also records when the cancellation
// happened and how many minutes before the scheduled service time it occurred
// (negative if cancelled after the scheduled time already passed).
const cancelBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A cancellation reason is required.' });
    }

    const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Booking is already cancelled.' });
    if (booking.status === 'completed') return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking.' });

    const now         = new Date();
    const scheduledAt = getScheduledDateTime(booking);

    booking.status               = 'cancelled';
    booking.cancellationReason   = reason.trim();
    booking.cancelledAt          = now;
    booking.minutesBeforeService = scheduledAt
      ? Math.round((scheduledAt.getTime() - now.getTime()) / 60000)
      : undefined;

    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error('cancelBooking error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── PATCH /api/bookings/:id/start ───────────────────────────────────────────
// Any team member can start — status change is shared (polling syncs other dashboards)
const startTask = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Task not found.' });

    booking.status        = 'in-progress';
    booking.taskStartedAt = new Date();
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error('startTask error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/bookings/:id/complete ────────────────────────────────────────
const completeTask = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Task not found.' });

    booking.status          = 'completed';
    booking.taskCompletedAt = new Date();
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error('completeTask error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/bookings/:id/cash-received ───────────────────────────────────
const markCashReceived = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Task not found.' });

    booking.paymentStatus = 'paid';
    if (!booking.paidAmount) booking.paidAmount = booking.price || 0;
    await booking.save();

    // Award loyalty points for the payment — non-fatal if it fails.
    try {
      await awardPointsForBooking(booking.customerId, booking.paidAmount, booking._id, booking.bookingId);
    } catch (loyaltyErr) {
      console.error('awardPointsForBooking (cash-received) error:', loyaltyErr);
    }

    res.json({ success: true, booking });
  } catch (err) {
    console.error('markCashReceived error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/bookings/:id/decline ─────────────────────────────────────────
const declineTask = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Decline reason is required.' });

    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Task not found.' });

    booking.declineHistory.push({
      staffId:    req.user._id,
      staffName:  req.user.name,
      staffEmail: req.user.email,
      reason,
    });

    const hasTeam  = booking.assignedTeam && booking.assignedTeam.length > 0;
    const todayStr = getTodayLocalStr();
    // For today's bookings only available staff can replace; future tasks use any staff
    const availFilter = booking.date === todayStr ? { isAvailable: true } : {};

    if (hasTeam) {
      // Remove declining member from team
      booking.assignedTeam = booking.assignedTeam.filter(
        m => m.staffId.toString() !== req.user._id.toString()
      );

      // If the declining member was the team lead, reassign lead to next remaining member
      if (booking.assignedStaffId && booking.assignedStaffId.toString() === req.user._id.toString()) {
        const remaining = booking.assignedTeam;
        if (remaining.length > 0) {
          booking.assignedStaffId    = remaining[0].staffId;
          booking.assignedStaffName  = remaining[0].staffName;
          booking.assignedStaffEmail = remaining[0].staffEmail;
        } else {
          booking.assignedStaffId    = undefined;
          booking.assignedStaffName  = undefined;
          booking.assignedStaffEmail = undefined;
        }
      }

      // Find replacement — exclude current team and everyone who already declined
      const excludeIds = [
        ...booking.assignedTeam.map(m => m.staffId),
        ...booking.declineHistory.map(d => d.staffId),
      ];

      const candidates = await User.find({
        role: 'staff',
        _id:  { $nin: excludeIds },
        ...availFilter,
      });
      
      //replacementSinglestaffbooking — find a different staff member
      if (candidates.length > 0) {
        const chosen = await pickLeastLoaded(candidates, 1);
        booking.assignedTeam.push({
          staffId:    chosen[0]._id,
          staffName:  chosen[0].name,
          staffEmail: chosen[0].email,
        });
        booking.needsAdminAttention     = false;
        booking.adminNotificationReason = '';
      } else {
        booking.needsAdminAttention     = true;
        booking.adminNotificationReason = `Team member ${req.user.name} declined. No replacement available.`;
      }
    } else {
      //replacementSinglestaffbooking — find a different staff member
      const candidates = await User.find({
        role: 'staff',
        _id:  { $ne: req.user._id },
        ...availFilter,
      });

      if (candidates.length > 0) {
        const chosen = await pickLeastLoaded(candidates, 1);
        booking.assignedStaffId    = chosen[0]._id;
        booking.assignedStaffName  = chosen[0].name;
        booking.assignedStaffEmail = chosen[0].email;
        booking.needsAdminAttention     = false;
        booking.adminNotificationReason = '';
      } else {
        booking.assignedStaffId    = undefined;
        booking.assignedStaffName  = undefined;
        booking.assignedStaffEmail = undefined;
        booking.needsAdminAttention     = true;
        booking.adminNotificationReason = `Staff ${req.user.name} declined. No available replacement found.`;
      }
    }

    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error('declineTask error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/bookings/all  (admin) ──────────────────────────────────────────
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .sort({ createdAt: -1 })
      .select('bookingId customerName customerEmail serviceName serviceCategory date time status price assignedStaffName assignedTeam needsAdminAttention adminNotificationReason cancellationReason cancelledAt minutesBeforeService');
    res.json({ success: true, bookings });
  } catch (err) {
    console.error('getAllBookings error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── POST /api/bookings/assign-unassigned  (admin) ───────────────────────────
const assignAllUnassigned = async (req, res) => {
  try {
    const unassigned = await Booking.find({
      status: { $nin: ['cancelled', 'completed'] },
      $or: [
        { assignedStaffId: { $exists: false } },
        { assignedStaffId: null },
      ],
    });

    for (const booking of unassigned) {
      await autoAssignBooking(booking);
    }

    res.json({ success: true, assigned: unassigned.length });
  } catch (err) {
    console.error('assignAllUnassigned error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/bookings/needs-attention  (admin) ───────────────────────────────
// Returns bookings flagged needsAdminAttention. Optional ?staffEmail= filter.
const getNeedsAttention = async (req, res) => {
  try {
    const { staffEmail } = req.query;

    const query = {
      needsAdminAttention: true,
      status: { $nin: ['cancelled', 'completed'] },
    };

    if (staffEmail) {
      query.$or = [
        { assignedStaffEmail:          staffEmail },
        { 'assignedTeam.staffEmail':   staffEmail },
        { 'declineHistory.staffEmail': staffEmail },
      ];
    }

    const bookings = await Booking.find(query).sort({ createdAt: -1 });

    const result = bookings.map(b => ({
      _id:           b._id.toString(),
      bookingId:     b.bookingId || b._id.toString(),
      customerName:  b.customerName  || 'N/A',
      customerEmail: b.customerEmail || '',
      service:       b.serviceName   || b.serviceCategory || 'N/A',
      date:          b.date          || '',
      time:          b.time          || '',
      address:       b.address       || '',
      status:        b.status,
      reason:        b.adminNotificationReason || '',
      teamMembers:   (b.assignedTeam || []).map(m => ({
        staffName:  m.staffName,
        staffEmail: m.staffEmail,
      })),
    }));

    res.json({ success: true, bookings: result });
  } catch (err) {
    console.error('getNeedsAttention error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PATCH /api/bookings/:id/resolve-attention  (admin) ──────────────────────
// Only clears the active-attention flag — adminNotificationReason is kept as a
// permanent record of why this booking was flagged, so it can still be checked
// later (e.g. "did this booking ever have a staffing problem?").
const resolveAttention = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    booking.needsAdminAttention = false;
    await booking.save();

    res.json({ success: true });
  } catch (err) {
    console.error('resolveAttention error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── POST /api/bookings/:id/send-invoice ─────────────────────────────────────
const sendInvoice = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      $or: [
        { assignedStaffId:        req.user._id },
        { 'assignedTeam.staffId': req.user._id },
      ],
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (!booking.customerEmail) return res.status(400).json({ success: false, message: 'No customer email on record for this booking.' });

    const now     = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const code    = (booking.serviceType || 'SRV').substring(0, 3).toUpperCase();
    const rand    = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    const invoiceNo = `INV-${code}-${dateStr}-${rand}`;

    const total   = booking.price       || 0;
    const paid    = booking.paidAmount  || 0;
    const balance = total - paid;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;padding:30px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;font-size:24px;">CLOUD LAUNDRY.LK</h1>
          <p style="margin:5px 0 0;opacity:.8;">Professional Cleaning Services</p>
        </div>
        <div style="background:white;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <h2 style="color:#7c3aed;margin-top:0;">Invoice ${invoiceNo}</h2>
          <p><strong>Booking ID:</strong> ${booking.bookingId || booking._id}</p>
          <p><strong>Scheduled:</strong> ${booking.date} at ${booking.time}</p>
          <hr style="border-color:#e5e7eb;margin:20px 0;">
          <h3 style="margin-top:0;">Customer Details</h3>
          <p style="margin:4px 0;"><strong>Name:</strong> ${booking.customerName || 'Customer'}</p>
          <p style="margin:4px 0;"><strong>Address:</strong> ${booking.address || '—'}</p>
          <hr style="border-color:#e5e7eb;margin:20px 0;">
          <h3 style="margin-top:0;">Service Details</h3>
          <table style="width:100%;border-collapse:collapse;margin-top:10px;">
            <tr style="background:#7c3aed;color:white;">
              <th style="padding:10px;text-align:left;border-radius:4px 0 0 4px;">Description</th>
              <th style="padding:10px;text-align:right;border-radius:0 4px 4px 0;">Amount (LKR)</th>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px;">${booking.serviceName || booking.serviceCategory || 'Cleaning Service'}</td>
              <td style="padding:10px;text-align:right;">${total.toLocaleString()}</td>
            </tr>
            <tr style="font-weight:bold;background:#f9fafb;">
              <td style="padding:10px;">Total</td>
              <td style="padding:10px;text-align:right;">LKR ${total.toLocaleString()}</td>
            </tr>
            <tr style="color:green;">
              <td style="padding:10px;">Paid Amount</td>
              <td style="padding:10px;text-align:right;">LKR ${paid.toLocaleString()}</td>
            </tr>
            ${balance > 0 ? `<tr style="color:#d97706;font-weight:bold;">
              <td style="padding:10px;">Balance Due</td>
              <td style="padding:10px;text-align:right;">LKR ${balance.toLocaleString()}</td>
            </tr>` : ''}
          </table>
          <p style="margin-top:16px;"><strong>Payment Method:</strong> ${booking.paymentMethodName || booking.paymentMethod || 'N/A'}</p>
          <hr style="border-color:#e5e7eb;margin:20px 0;">
          <p style="color:#6b7280;font-size:12px;margin:0;">Thank you for choosing Cloud Laundry.LK.<br>
          For queries contact <a href="mailto:info@cloudlaundry.lk">info@cloudlaundry.lk</a> or call +94 11 234 5678.</p>
        </div>
      </div>`;

    const sent = await sendEmail({
      to:      booking.customerEmail,
      subject: `Invoice ${invoiceNo} – ${booking.serviceName || 'Cleaning Service'} | Cloud Laundry.LK`,
      html,
    });

    if (sent) {
      res.json({ success: true, message: `Invoice sent to ${booking.customerEmail}.` });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send invoice email.' });
    }
  } catch (err) {
    console.error('sendInvoice error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getAssignedBookings,
  checkSlotAvailability,
  rescheduleBooking,
  cancelBooking,
  startTask,
  completeTask,
  markCashReceived,
  declineTask,
  getAllBookings,
  assignAllUnassigned,
  getNeedsAttention,
  resolveAttention,
  sendInvoice,
};
