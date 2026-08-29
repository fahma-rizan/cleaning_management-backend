const mongoose  = require('mongoose');
const Booking   = require('../models/Booking');
const Invoice   = require('../models/Invoice');
const Feedback  = require('../models/Feedback');
const Notification = require('../models/Notification');
const { emitEvent, emitToUser } = require('../sockets/socketManager');

// @desc    Customer submits feedback or a complaint about a completed booking
// @route   POST /api/feedback
// @access  Private
exports.submitFeedback = async (req, res) => {
  try {
    const { bookingId, type, category, rating, comment, photos } = req.body;

    if (!bookingId || !type || !comment) {
      return res.status(400).json({ msg: 'bookingId, type and comment are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ msg: `"${bookingId}" is not a valid booking ID.` });
    }
    if (!['FEEDBACK', 'COMPLAINT'].includes(type)) {
      return res.status(400).json({ msg: 'type must be FEEDBACK or COMPLAINT.' });
    }
    if (type === 'FEEDBACK' && (!rating || rating < 1 || rating > 5)) {
      return res.status(400).json({ msg: 'A rating from 1 to 5 is required for feedback.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ msg: 'Booking not found.' });

    // Only bookings the service has actually been delivered on are eligible —
    // there's nothing to give feedback about, or complain about, before then.
    if (booking.status !== 'completed') {
      return res.status(400).json({ msg: `Feedback can only be submitted for a completed booking. This booking is currently ${booking.status}.` });
    }

    // Prevent duplicate submissions of the same type for the same booking —
    // one rating and one complaint per job, not an unlimited stream.
    const existing = await Feedback.findOne({ booking: booking._id, type });
    if (existing) {
      return res.status(400).json({ msg: `You've already submitted ${type === 'FEEDBACK' ? 'feedback' : 'a complaint'} for this booking.` });
    }

    const invoice = await Invoice.findOne({ bookingId: booking._id }).select('_id');

    const cleanPhotos = Array.isArray(photos)
      ? photos.filter(p => p && typeof p.url === 'string' && p.url.length > 0).slice(0, 5)
      : [];

    const feedback = new Feedback({
      booking: booking._id,
      invoice: invoice?._id,
      customer: {
        userId: req.user?.id || booking.customerId?.toString(),
        name:   booking.customerName,
        email:  booking.customerEmail,
        phone:  req.body.customerPhone || '',
      },
      type,
      category: category || 'OTHER',
      rating: type === 'FEEDBACK' ? rating : undefined,
      comment,
      photos: cleanPhotos,
    });
    await feedback.save();

    // Notify admin — never let a notification failure break the actual
    // submission, which has already succeeded by this point.
    try {
      emitEvent(type === 'COMPLAINT' ? 'complaintSubmitted' : 'feedbackSubmitted', { feedback, booking });
    } catch (notifyErr) {
      console.warn('Could not emit feedback/complaint event:', notifyErr.message);
    }

    res.status(201).json(feedback);
  } catch (err) {
    console.error('Error submitting feedback:', err.message);
    res.status(500).json({ msg: 'Could not submit your feedback. Please try again later.' });
  }
};

// @desc    Get all feedback/complaints (admin), optionally filtered
// @route   GET /api/feedback?type=&status=
// @access  Private (admin)
exports.getAllFeedback = async (req, res) => {
  try {
    const query = {};
    if (req.query.type)   query.type   = req.query.type.toUpperCase();
    if (req.query.status) query.status = req.query.status.toUpperCase();

    const feedback = await Feedback.find(query)
      .populate({ path: 'booking', select: 'bookingId serviceType serviceName assignedStaffName date time', model: 'Booking' })
      .sort({ createdAt: -1 });

    res.json(feedback);
  } catch (err) {
    console.error('Error fetching feedback:', err.message);
    res.status(500).json({ msg: 'Failed to fetch feedback.' });
  }
};

// @desc    Admin responds to a feedback/complaint entry
// @route   POST /api/feedback/:id/respond
// @access  Private (admin)
exports.respondToFeedback = async (req, res) => {
  try {
    const { response, status } = req.body;
    if (!response) return res.status(400).json({ msg: 'A response message is required.' });

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ msg: 'Feedback entry not found.' });

    feedback.adminResponse = response;
    feedback.respondedAt   = new Date();
    feedback.respondedBy   = req.user?.email || req.user?.id || 'Admin';
    feedback.status        = status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)
      ? status
      : 'RESOLVED';
    await feedback.save();

    // Notify the customer — never let this fail the response, which has
    // already succeeded by this point.
    try {
      if (feedback.customer?.userId) {
        const notification = new Notification({
          userId:    feedback.customer.userId,
          type:      'feedback-response',
          title:     feedback.type === 'COMPLAINT' ? 'Your Complaint Has Been Reviewed' : 'Thanks for Your Feedback',
          message:   response,
          bookingId: feedback.booking?.toString(),
        });
        await notification.save();
        emitToUser(feedback.customer.userId, 'notification', {
          type:      'feedback-response',
          title:     notification.title,
          message:   response,
        });
      }
      emitEvent('feedbackUpdate', feedback);
    } catch (notifyErr) {
      console.warn('Feedback responded to but notification failed:', notifyErr.message);
    }

    res.json(feedback);
  } catch (err) {
    console.error('Error responding to feedback:', err.message);
    res.status(500).json({ msg: 'Failed to save response.' });
  }
};

// @desc    Admin updates just the status (e.g. reopen, close) without a new response
// @route   PUT /api/feedback/:id/status
// @access  Private (admin)
exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ msg: 'A valid status is required.' });
    }

    const feedback = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!feedback) return res.status(404).json({ msg: 'Feedback entry not found.' });

    res.json(feedback);
  } catch (err) {
    console.error('Error updating feedback status:', err.message);
    res.status(500).json({ msg: 'Failed to update status.' });
  }
};
