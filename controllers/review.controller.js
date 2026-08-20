const Review = require('../models/Review');
const Booking = require('../models/Booking');

exports.getStats = async (req, res) => {
  try {
    const stats = await Review.aggregate([
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);
    const distribution = [5, 4, 3, 2, 1].map(star => ({ star, count: stats.find(s => s._id === star)?.count || 0 }));
    const total = distribution.reduce((sum, s) => sum + s.count, 0);
    const average = total > 0 ? distribution.reduce((sum, s) => sum + s.star * s.count, 0) / total : 0;
    res.json({ distribution, total, average: average.toFixed(1) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getAll = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (search) filter.$or = [
      { customerName: { $regex: search, $options: 'i' } },
      { serviceName:  { $regex: search, $options: 'i' } },
      { content:      { $regex: search, $options: 'i' } },
    ];
    const reviews = await Review.find(filter).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.approve = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { $set: { status: 'Approved' } }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.hide = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { $set: { status: 'Hidden' } }, { new: true });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.remove = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ message: 'Review deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.create = async (req, res) => {
  try {
    const { bookingId, rating, content } = req.body;
    const customerId = req.admin.id;

    if (!bookingId || !rating) {
      return res.status(400).json({ error: 'bookingId and rating are required' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.customerId) !== String(customerId)) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'You can only review completed bookings' });
    }

    const existing = await Review.findOne({ bookingId });
    if (existing) return res.status(409).json({ error: 'You already reviewed this booking' });

    const review = await Review.create({
      bookingId,
      customerId,
      customerName: booking.customerName || 'Customer',
      serviceName: booking.serviceName || booking.serviceType,
      rating,
      content: content || '',
      status: 'Pending',
    });

    res.status(201).json(review);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getPublicStats = async (req, res) => {
  try {
    const { serviceName } = req.query;
    if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });

    const match = { serviceName };
    const stats = await Review.aggregate([
      { $match: match },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);
    const distribution = [5, 4, 3, 2, 1].map(star => ({ star, count: stats.find(s => s._id === star)?.count || 0 }));
    const total = distribution.reduce((sum, s) => sum + s.count, 0);
    const average = total > 0 ? distribution.reduce((sum, s) => sum + s.star * s.count, 0) / total : 0;

    res.json({ average: average.toFixed(1), total });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.getPublicReviews = async (req, res) => {
  try {
    const { serviceName } = req.query;
    if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });
    const reviews = await Review.find({ serviceName }).sort({ createdAt: -1 }).limit(20);
    res.json(reviews);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};