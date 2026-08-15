const Review = require('../models/Review');

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
    const reviews = await Review.find(filter).sort({ createdAt: -1 });
    res.json(reviews);
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

module.exports = { getAllReviews, getStats, approveReview, hideReview, deleteReview };
