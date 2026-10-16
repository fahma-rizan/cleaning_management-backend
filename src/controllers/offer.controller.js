const Offer = require('../models/Offer');

// ─── GET /api/offers  (public) ────────────────────────────────────────────────
const getOffers = async (req, res, next) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    }).sort({ createdAt: -1 });

    res.json({ success: true, count: offers.length, offers });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/offers/validate  (validate a promo code) ──────────────────────
const validateCode = async (req, res, next) => {
  try {
    const { code, serviceId, orderAmount } = req.body;
    const now = new Date();

    const offer = await Offer.findOne({
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    });

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Invalid or expired promo code.' });
    }

    if (offer.minOrderAmount && orderAmount < offer.minOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of LKR ${offer.minOrderAmount} required.`,
      });
    }

    if (offer.applicableServices.length > 0 && !offer.applicableServices.includes(Number(serviceId))) {
      return res.status(400).json({
        success: false,
        message: 'This promo code is not applicable to the selected service.',
      });
    }

    if (offer.totalUsageLimit && offer.usedCount >= offer.totalUsageLimit) {
      return res.status(400).json({ success: false, message: 'This promo code has reached its usage limit.' });
    }

    const discount =
      offer.discountType === 'percentage'
        ? Math.round((orderAmount * offer.discountValue) / 100)
        : offer.discountValue;

    res.json({
      success: true,
      offer: {
        id: offer._id,
        code: offer.code,
        title: offer.title,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        discountAmount: discount,
        finalAmount: Math.max(0, orderAmount - discount),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/offers  (admin only) ──────────────────────────────────────────
const createOffer = async (req, res, next) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json({ success: true, offer });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/offers/:id  (admin only) ───────────────────────────────────────
const updateOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found.' });
    res.json({ success: true, offer });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/offers/:id  (admin only) ────────────────────────────────────
const deleteOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found.' });
    res.json({ success: true, message: 'Offer deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOffers, validateCode, createOffer, updateOffer, deleteOffer };
