const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

// ─── Helper: calculate loyalty points (1 point per LKR 100 spent) ─────────────
const calcLoyaltyPoints = (amount) => Math.floor(amount / 100);

// ─── POST /api/bookings ───────────────────────────────────────────────────────
const createBooking = async (req, res, next) => {
  try {
    // ── Verify the service exists and is active — don't trust the client's
    //    serviceId blindly, and don't trust its serviceName/serviceType either.
    const serviceIdNum = Number(req.body.serviceId);
    const service = Number.isFinite(serviceIdNum)
      ? await Service.findOne({ serviceId: serviceIdNum, isActive: true })
      : null;

    if (!service) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive service selected.' });
    }

    // ── Basic price sanity check. NOTE: this is not a full server-side
    //    recalculation of price (that would need to replicate every
    //    pricingType's rules from PriceList — per-sqft, per-item combos,
    //    per-seat, per-unit — which is a larger follow-up, not a pre-demo fix).
    //    This just blocks obviously invalid/tampered values.
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid price.' });
    }
    if (service.basePrice && price < service.basePrice * 0.2) {
      console.warn(
        `[createBooking] price ${price} looks unusually low for service ${service.serviceId} ` +
        `(basePrice ${service.basePrice}) — booking allowed, but flag for review.`
      );
    }

    const bookingData = {
      ...req.body,
      price,
      customerId: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      // Authoritative from the DB catalog, not the frontend's hardcoded maps
      serviceName: service.name,
      serviceType: service.mainServiceType,
      // serviceCategory is left as client-supplied: it carries the specific
      // sub-selection (cleaning type, curtain sub-service, etc.) that the
      // Service document doesn't model per-booking.
    };

    const booking = await Booking.create(bookingData);

    // Award loyalty points
    const pointsEarned = calcLoyaltyPoints(booking.price);
    if (pointsEarned > 0) {
      const user = await User.findById(req.user._id);
      user.loyaltyPoints = (user.loyaltyPoints || 0) + pointsEarned;
      user.updateBadge();
      await user.save();
      booking.loyaltyPointsEarned = pointsEarned;
      await booking.save();
    }

    // Create confirmation notification
    await Notification.create({
      userId: req.user._id,
      type: 'order-confirmed',
      title: 'Booking Confirmed! 🎉',
      message: `Your ${booking.serviceName} is scheduled for ${booking.date} at ${booking.time}.`,
      actionUrl: `/bookings/${booking._id}`,
      bookingId: booking._id,
    });

    res.status(201).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/bookings  (customer: own bookings | admin/staff: all) ───────────
const getBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = {};

    // Customers see only their own bookings
    if (req.user.role === 'customer') {
      filter.customerId = req.user._id;
    }
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('customerId', 'name email phone')
        .populate('assignedStaffId', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      bookings,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────
const getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('assignedStaffId', 'name phone');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Customers can only view their own bookings
    if (req.user.role === 'customer' && booking.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/bookings/:id/status  (admin/staff only) ────────────────────────
const updateBookingStatus = async (req, res, next) => {
  try {
    const { status, assignedStaffId } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    booking.status = status;
    if (assignedStaffId) booking.assignedStaffId = assignedStaffId;
    if (status === 'completed') booking.completedAt = new Date();
    if (status === 'cancelled') booking.cancelledAt = new Date();

    await booking.save();

    // Notify customer of status change
    const statusMessages = {
      confirmed:  `Your ${booking.serviceName} on ${booking.date} has been confirmed.`,
      processing: `A cleaner is on the way for your ${booking.serviceName}.`,
      completed:  `Your ${booking.serviceName} is complete. Please rate your experience!`,
      cancelled:  `Your ${booking.serviceName} booking has been cancelled.`,
    };

    if (statusMessages[status]) {
      const notifType =
        status === 'completed' ? 'rating-request' :
        status === 'processing' ? 'worker-arrival' :
        'tracking-update';

      await Notification.create({
        userId: booking.customerId,
        type: notifType,
        title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: statusMessages[status],
        bookingId: booking._id,
        actionUrl: `/bookings/${booking._id}`,
      });
    }

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/bookings/:id/cancel  (customer: cancel own booking) ─────────────
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }

    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking.` });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    // Reverse loyalty points
    if (booking.loyaltyPointsEarned > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { loyaltyPoints: -booking.loyaltyPointsEarned },
      });
    }

    res.json({ success: true, message: 'Booking cancelled.', booking });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/bookings/stats  (admin only) ────────────────────────────────────
const getBookingStats = async (req, res, next) => {
  try {
    const stats = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$price' },
        },
      },
    ]);

    const totalRevenue = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);

    res.json({
      success: true,
      stats,
      totalRevenue: totalRevenue[0]?.total || 0,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  getBookingStats,
};