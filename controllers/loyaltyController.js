const User = require('../models/User');
const LoyaltyTransaction = require('../models/LoyaltyTransaction');

// Tier thresholds — based on LIFETIME points, never reset. Keep in sync with
// the frontend's src/app/lib/loyaltyTiers.ts.
const TIERS = [
  { name: 'Bronze',   min: 0,   max: 99,       discount: 0,    earningRate: 1.0 },
  { name: 'Silver',   min: 100, max: 299,      discount: 0.05, earningRate: 1.5 },
  { name: 'Gold',     min: 300, max: 699,      discount: 0.10, earningRate: 2.0 },
  { name: 'Platinum', min: 700, max: Infinity, discount: 0.15, earningRate: 3.0 },
];

const getTier = (lifetimePoints = 0) =>
  [...TIERS].reverse().find(t => lifetimePoints >= t.min) || TIERS[0];

// ─── GET /api/loyalty/account ──────────────────────────────────────────────────
const getAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const lifetimePoints = user.lifetimePoints || 0;
    const tier = getTier(lifetimePoints);
    const tierDiscountsUsed = user.tierDiscountsUsed || {};

    const discountAvailable = !!user.pendingTierDiscount?.tier;

    res.json({
      currentBalance: user.loyaltyPoints || 0,
      lifetimePoints,
      currentTier: tier.name.toLowerCase(),
      discountPercent: user.pendingTierDiscount?.percent
        ? Math.round(user.pendingTierDiscount.percent * 100)
        : Math.round(tier.discount * 100),
      discountAvailable,
      tierDiscountsUsed,
    });
  } catch (err) {
    console.error('getAccount error:', err);
    res.status(500).json({ error: 'Failed to load loyalty account' });
  }
};

// ─── GET /api/loyalty/history ──────────────────────────────────────────────────
const getHistory = async (req, res) => {
  try {
    const transactions = await LoyaltyTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        points: t.points,
        reason: t.reason,
        bookingId: t.bookingId,
        createdAt: t.createdAt,
      })),
      pagination: { total: transactions.length },
    });
  } catch (err) {
    console.error('getHistory error:', err);
    res.status(500).json({ error: 'Failed to load loyalty history' });
  }
};

// ─── POST /api/loyalty/redeem ──────────────────────────────────────────────────
// Body: { bookingId, points, bookingAmountInRs }
const redeemPoints = async (req, res) => {
  try {
    const { bookingId, points } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const pts = Number(points) || 0;
    if (pts < 100) return res.status(400).json({ message: 'Minimum 100 points required to redeem' });
    if (pts > (user.loyaltyPoints || 0)) {
      return res.status(400).json({ message: 'Insufficient point balance' });
    }

    user.loyaltyPoints -= pts;
    await user.save();

    await LoyaltyTransaction.create({
      userId: user._id,
      type: 'redeemed',
      points: -pts,
      reason: `Redeemed ${pts} pts for Rs. ${pts} discount`,
      bookingId: bookingId || undefined,
    });

    res.json({ currentBalance: user.loyaltyPoints, discountAmount: pts });
  } catch (err) {
    console.error('redeemPoints error:', err);
    res.status(500).json({ message: 'Failed to redeem points' });
  }
};

// ─── GET /api/loyalty/tier-discount ────────────────────────────────────────────
const checkTierDiscount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.pendingTierDiscount?.tier) {
      return res.json({
        available: true,
        tier: user.pendingTierDiscount.tier,
        percent: Math.round(user.pendingTierDiscount.percent * 100),
      });
    }
    res.json({ available: false });
  } catch (err) {
    console.error('checkTierDiscount error:', err);
    res.status(500).json({ error: 'Failed to check tier discount' });
  }
};

// ─── POST /api/loyalty/tier-discount/apply ─────────────────────────────────────
const applyTierDiscount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tier = getTier(user.lifetimePoints || 0);
    const tierDiscountsUsed = user.tierDiscountsUsed || {};

    if (tierDiscountsUsed[tier.name]) {
      return res.status(400).json({ message: `Your ${tier.name} tier discount has already been used` });
    }
    if (tier.discount <= 0) {
      return res.status(400).json({ message: 'No tier discount available at your current tier' });
    }

    user.pendingTierDiscount = { tier: tier.name, percent: tier.discount, reservedAt: new Date() };
    tierDiscountsUsed[tier.name] = true;
    user.tierDiscountsUsed = tierDiscountsUsed;
    user.markModified('tierDiscountsUsed');
    await user.save();

    res.json({ tier: tier.name, percent: Math.round(tier.discount * 100), reserved: true });
  } catch (err) {
    console.error('applyTierDiscount error:', err);
    res.status(500).json({ message: 'Failed to reserve tier discount' });
  }
};

// ─── Internal helper: award points for a completed/paid booking ───────────────
// Not a route — called from bookingController when a booking is paid/completed.
const awardPointsForBooking = async (userId, amountPaid, bookingId, bookingRef) => {
  const user = await User.findById(userId);
  if (!user) return;

  const tier = getTier(user.lifetimePoints || 0);
  const earned = Math.round((amountPaid / 100) * tier.earningRate);
  if (earned <= 0) return;

  user.loyaltyPoints  = (user.loyaltyPoints  || 0) + earned;
  user.lifetimePoints = (user.lifetimePoints || 0) + earned;
  const newTier = getTier(user.lifetimePoints);
  const tierChanged = newTier.name !== tier.name;
  user.updateBadge();
  await user.save();

  await LoyaltyTransaction.create({
    userId: user._id,
    type: 'earned',
    points: earned,
    reason: 'Earned for booking payment (full)',
    bookingId,
  });

  if (tierChanged) {
    await LoyaltyTransaction.create({
      userId: user._id,
      type: 'bonus',
      points: 0,
      reason: `Tier upgraded from ${tier.name.toLowerCase()} to ${newTier.name.toLowerCase()} — lifetime points reached ${user.lifetimePoints}`,
    });
  }
};

module.exports = {
  getAccount, getHistory, redeemPoints, checkTierDiscount, applyTierDiscount,
  awardPointsForBooking, getTier, TIERS,
};
