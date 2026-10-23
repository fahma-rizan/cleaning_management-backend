const mongoose = require('mongoose');
const Review   = require('../models/Review');
const Booking  = require('../models/Booking');

// Escapes regex metacharacters so a serviceName containing them (e.g. from
// a malformed query param) is treated as a literal string, not a pattern.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── POST /api/reviews ──────────────────────────────────────────────────────────
// Customer submits a review for one of their own completed bookings.
const createReview = async (req, res) => {
  try {
    const { bookingId, rating, content } = req.body;
    const customerId = req.user._id;

    if (!bookingId || !rating) {
      return res.status(400).json({ error: 'bookingId and rating are required' });
    }

    const booking = /^[0-9a-fA-F]{24}$/.test(bookingId)
      ? await Booking.findById(bookingId)
      : await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (String(booking.customerId) !== String(customerId)) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'You can only review completed bookings' });
    }

    const existing = await Review.findOne({ bookingId: booking._id });
    if (existing) return res.status(409).json({ error: 'You already reviewed this booking' });

    // Team bookings assign multiple staff (booking.assignedTeam); single
    // bookings use assignedStaffId/assignedStaffName. Either way, every
    // staff member on this booking gets credit for the customer's rating.
    const teamMembers = Array.isArray(booking.assignedTeam) && booking.assignedTeam.length > 0
      ? booking.assignedTeam
      : (booking.assignedStaffId
          ? [{ staffId: booking.assignedStaffId, staffName: booking.assignedStaffName }]
          : []);

    const review = await Review.create({
      bookingId:    booking._id,
      customerId,
      customerName: booking.customerName || req.user.name || 'Customer',
      serviceName:  booking.serviceName || booking.serviceType,
      staffId:      teamMembers[0]?.staffId || null,
      staffName:    teamMembers[0]?.staffName || null,
      staffIds:     teamMembers.map((m) => m.staffId).filter(Boolean),
      staffNames:   teamMembers.map((m) => m.staffName).filter(Boolean),
      rating,
      content: content || '',
      status: 'Pending',
    });

    res.status(201).json(review);
  } catch (err) {
    console.error('createReview error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
};

// ─── GET /api/reviews/public/stats?serviceName= ─────────────────────────────────
// Public — no approval step; every submitted review counts immediately.
// Powers the star-rating shown on customer-facing service pages.
const getPublicStats = async (req, res) => {
  try {
    const { serviceName } = req.query;
    if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });

    // Case-insensitive: bookings store serviceName lowercase (e.g. 'sofa
    // cleaning'), but callers may pass a title-case display name — both
    // should resolve to the same reviews. No approval step — every
    // submitted review is public immediately.
    const reviews = await Review.find({
      serviceName: { $regex: `^${escapeRegex(serviceName)}$`, $options: 'i' },
    });
    const total = reviews.length;
    const average = total > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1)
      : '0.0';
    const distribution = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviews.filter(r => r.rating === star).length,
    }));

    res.json({ average, total, distribution });
  } catch (err) {
    console.error('getPublicStats error:', err);
    res.status(500).json({ error: 'Failed to load review stats' });
  }
};

// ─── GET /api/reviews/public/list?serviceName= ──────────────────────────────────
const getPublicReviews = async (req, res) => {
  try {
    const { serviceName } = req.query;
    if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });
    const reviews = await Review.find({
      serviceName: { $regex: `^${escapeRegex(serviceName)}$`, $options: 'i' },
    }).sort({ createdAt: -1 }).limit(20);
    res.json(reviews);
  } catch (err) {
    console.error('getPublicReviews error:', err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
};

// ─── GET /api/reviews ───────────────────────────────────────────────────────────
const getAllReviews = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { serviceName:  { $regex: search, $options: 'i' } },
        { content:      { $regex: search, $options: 'i' } },
      ];
    }
    // bookingId on Review is an ObjectId ref, not the human-readable
    // "BK-..." code — returning it raw either showed a long Mongo hex
    // string, or nothing for reviews whose linked booking doesn't
    // resolve, which is what showed up as a blank "Booking #".
    //
    // Using .populate() here 500'd the whole list ("Failed to load
    // reviews") instead — some Review documents in this database have a
    // bookingId value that isn't a valid ObjectId at all (leftover from
    // before the schema was unified), and populate has to cast every
    // document's ref before it can run its sub-query, so one bad value
    // fails the entire request. Resolving IDs manually here instead means
    // a malformed value on one review just yields no booking code for
    // that review, rather than breaking every review in the list.
    const reviews = await Review.find(filter).sort({ createdAt: -1 }).lean();

    const validIds = [...new Set(
      reviews
        .map((r) => r.bookingId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    )];
    const bookings = await Booking.find({ _id: { $in: validIds } }).select('bookingId').lean();
    const codeById = new Map(bookings.map((b) => [String(b._id), b.bookingId]));

    const mapped = reviews.map((r) => ({
      ...r,
      bookingId: (r.bookingId && codeById.get(String(r.bookingId))) || null,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('getAllReviews error:', err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
};

// ─── GET /api/reviews/stats ─────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const reviews = await Review.find();
    const total = reviews.length;
    const average = total > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1)
      : '0.0';

    const distribution = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviews.filter(r => r.rating === star).length,
    }));

    const counts = {
      All:      total,
      Pending:  reviews.filter(r => r.status === 'Pending').length,
      Approved: reviews.filter(r => r.status === 'Approved').length,
      Hidden:   reviews.filter(r => r.status === 'Hidden').length,
    };

    res.json({ distribution, total, average, counts });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ error: 'Failed to load review stats' });
  }
};

// ─── PUT /api/reviews/:id/approve ────────────────────────────────────────────────
const approveReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { status: 'Approved' }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) {
    console.error('approveReview error:', err);
    res.status(500).json({ error: 'Failed to approve review' });
  }
};

// ─── PUT /api/reviews/:id/hide ───────────────────────────────────────────────────
const hideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { status: 'Hidden' }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) {
    console.error('hideReview error:', err);
    res.status(500).json({ error: 'Failed to hide review' });
  }
};

// ─── DELETE /api/reviews/:id ──────────────────────────────────────────────────────
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteReview error:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
};

module.exports = {
  createReview, getPublicStats, getPublicReviews,
  getAllReviews, getStats, approveReview, hideReview, deleteReview,
};