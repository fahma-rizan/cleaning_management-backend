const Offer = require('../models/Offer');

const isCurrentlyValid = (offer) => {
  if (!offer.isActive) return false;
  const today = new Date().toISOString().split('T')[0];
  if (offer.validFrom && today < offer.validFrom) return false;
  if (offer.validTo && offer.validTo !== 'Ongoing' && today > offer.validTo) return false;
  return true;
};

// ─── GET /api/offers ────────────────────────────────────────────────────────────
// Public — customer-facing. Only returns currently-active, in-date offers.
const getActiveOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(offers.filter(isCurrentlyValid));
  } catch (err) {
    console.error('getActiveOffers error:', err);
    res.status(500).json({ error: 'Failed to load offers' });
  }
};

// ─── GET /api/offers/all ────────────────────────────────────────────────────────
// Admin — every offer, active or not (for a future offers-management panel).
const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error('getAllOffers error:', err);
    res.status(500).json({ error: 'Failed to load offers' });
  }
};

// ─── POST /api/offers ───────────────────────────────────────────────────────────
const createOffer = async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json(offer);
  } catch (err) {
    console.error('createOffer error:', err);
    res.status(500).json({ error: 'Failed to create offer' });
  }
};

// ─── PUT /api/offers/:id ─────────────────────────────────────────────────────────
const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json(offer);
  } catch (err) {
    console.error('updateOffer error:', err);
    res.status(500).json({ error: 'Failed to update offer' });
  }
};

// ─── DELETE /api/offers/:id ──────────────────────────────────────────────────────
const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteOffer error:', err);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
};

// ─── POST /api/offers/validate ───────────────────────────────────────────────────
// Body: { code, serviceId, orderAmount }
const validateOffer = async (req, res) => {
  try {
    const { code, serviceId, orderAmount } = req.body;
    if (!code) return res.status(400).json({ message: 'Promo code is required' });

    const offer = await Offer.findOne({ code: String(code).trim().toUpperCase() });
    if (!offer) return res.status(404).json({ message: 'Invalid promo code' });
    if (!isCurrentlyValid(offer)) return res.status(400).json({ message: 'This promo code has expired' });

    const applies =
      offer.applicableServices.includes('all') ||
      offer.applicableServices.includes(String(serviceId));
    if (!applies) return res.status(400).json({ message: 'This promo code does not apply to this service' });

    const amount = Number(orderAmount) || 0;
    if (offer.minAmount && amount < offer.minAmount) {
      return res.status(400).json({
        message: `Minimum booking amount for this code is LKR ${offer.minAmount.toLocaleString()}`,
      });
    }

    const discountAmount = offer.discountType === 'percentage'
      ? Math.round(amount * (offer.discountValue / 100))
      : offer.discountValue;

    res.json({ offer: { ...offer.toObject(), discountAmount } });
  } catch (err) {
    console.error('validateOffer error:', err);
    res.status(500).json({ message: 'Failed to validate promo code' });
  }
};

module.exports = { getActiveOffers, getAllOffers, createOffer, updateOffer, deleteOffer, validateOffer };
