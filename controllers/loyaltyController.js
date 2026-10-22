const mongoose            = require('mongoose');
const User                = require('../models/User');
const Booking              = require('../models/Booking');
const Payment              = require('../models/Payment');
const LoyaltyTransaction   = require('../models/LoyaltyTransaction');
const { TIERS, getTier } = require('../constants/loyalty');
const {
  calculateEarnedPoints, computeNewlyGrantedTiers, splitEarnedForDebtRepayment, splitReversal, validateRedemption,
  calculateMaxRedeemable,
} = require('../utils/loyaltyCalc');

// A brief network/replica-set blip during a transaction shows up as a
// MongoDB "TransientTransactionError"/"UnknownTransactionCommitResult"
// (or a raw connection-reset error before the driver gets far enough to
// label it) — these are expected to be retried, not treated as a real
// failure. This is exactly the kind of error that once slipped through as
// "payment confirmed, but we could not credit your loyalty points" for a
// customer even though the operation would have succeeded a moment later.
const isRetryableError = (err) => {
  if (err?.errorLabelSet?.has?.('TransientTransactionError')) return true;
  if (err?.errorLabelSet?.has?.('UnknownTransactionCommitResult')) return true;
  if (typeof err?.hasErrorLabel === 'function' && (err.hasErrorLabel('TransientTransactionError') || err.hasErrorLabel('UnknownTransactionCommitResult'))) return true;
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|connection.*(closed|reset|timed out)|topology was destroyed|pool.*(closed|destroyed)|socket.*closed/i.test(err?.message || '');
};

// ─── Internal helper: run fn inside a transaction if the deployment supports
// sessions (any real replica set / Atlas cluster), otherwise run it directly.
// A bare standalone mongod (e.g. some local dev/test setups) doesn't support
// transactions at all — this keeps the code working there too, just without
// the atomicity guarantee, rather than hard-failing every loyalty operation.
// Retries a handful of times on a transient error before giving up.
const runAtomic = async (fn, attempt = 1) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    // Standalone mongod (no replica set) — transactions aren't supported at
    // all there. Fall back to running the same logic without a session
    // rather than hard-failing every loyalty operation.
    if (/Transaction numbers are only allowed on a replica set|IllegalOperation/.test(err?.message || '')) {
      return fn(null);
    }
    if (isRetryableError(err) && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
      return runAtomic(fn, attempt + 1);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Retry wrapper for the (Payment.create + processSuccessfulPayment) pair
// that each real payment-success point runs — Payment.create() itself is a
// plain write outside any transaction, so a transient connection blip there
// wouldn't be covered by runAtomic's own retry (which only wraps the loyalty
// transaction). Wrapping the whole pair means a brief hiccup anywhere in it
// is retried instead of surfacing as "payment confirmed, but we could not
// credit your loyalty points" for what would have succeeded a moment later.
const withPaymentRetry = async (fn, attempt = 1) => {
  try {
    return await fn();
  } catch (err) {
    if (isRetryableError(err) && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
      return withPaymentRetry(fn, attempt + 1);
    }
    throw err;
  }
};

// ─── Internal helper: current tier-perk availability for a user ───────────────
// A tier's one-time perk is available to APPLY exactly when it's been
// GRANTED (the customer has ever reached that tier) and not yet USED —
// scoped to the customer's CURRENT tier only.
const getTierPerkInfo = (user) => {
  const tier = getTier(user.lifetimePoints || 0);
  const granted = !!(user.tierPerksGranted || {})[tier.name];
  const used = !!(user.tierPerksUsed || {})[tier.name];
  return {
    tier,
    percent: Math.round(tier.discount * 100),
    available: tier.discount > 0 && granted && !used,
  };
};

// ─── Internal helper: grant any newly-reachable, never-before-granted tier
// perks for a user, given their (already updated) lifetimePoints. Handles
// jumping multiple tiers in one payment — every tier crossed gets its perk,
// not just the final one — and is safe to call for a legacy account that's
// already sitting at a tier with no grant history (it just backfills it).
// Never called on the reversal/downgrade path, so a perk once granted is
// never un-granted by a later tier drop.
const grantNewTierPerks = (user) => {
  const granted = user.tierPerksGranted || {};
  const newlyGranted = computeNewlyGrantedTiers(granted, user.lifetimePoints || 0);
  for (const tierName of newlyGranted) granted[tierName] = true;
  user.tierPerksGranted = granted;
  if (typeof user.markModified === 'function') user.markModified('tierPerksGranted');
  return newlyGranted;
};

// ─── GET /api/loyalty/account ──────────────────────────────────────────────────
const getAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const lifetimePoints = user.lifetimePoints || 0;
    const { percent, available } = getTierPerkInfo(user);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    // Net earned this month — 'earned' transactions minus any 'reversed'
    // ones that landed this month too (points clawed back from a
    // cancellation this month should immediately bring this figure down,
    // not just lifetimePoints/currentBalance). 'reversed' transactions
    // already store negative points, so summing both types together nets
    // them out correctly.
    const earnedThisMonth = await LoyaltyTransaction.aggregate([
      { $match: { userId: user._id, type: { $in: ['earned', 'reversed'] }, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]);

    res.json({
      currentBalance:     user.loyaltyPoints || 0,
      // The most this customer could redeem right now, per the "always keep
      // at least 100 points" rule — 0 whenever currentBalance <= 100.
      maxRedeemable:      (user.loyaltyDebt || 0) > 0 ? 0 : calculateMaxRedeemable(user.loyaltyPoints || 0),
      lifetimePoints,
      loyaltyDebt:        user.loyaltyDebt || 0,
      currentTier:        getTier(lifetimePoints).name.toLowerCase(),
      tierPerksGranted:   user.tierPerksGranted || {},
      tierPerksUsed:       user.tierPerksUsed || {},
      discountAvailable:  available,
      discountPercent:    percent,
      earnedThisMonth:    earnedThisMonth[0]?.total || 0,
    });
  } catch (err) {
    console.error('getAccount error:', err);
    res.status(500).json({ error: 'Failed to load loyalty account' });
  }
};

// ─── GET /api/loyalty/history ──────────────────────────────────────────────────
// Paginated, newest first. Filterable by ?type=earned|redeemed|reversed|
// expired|bonus, ?bookingId=..., and a ?startDate=YYYY-MM-DD/?endDate=YYYY-MM-DD
// createdAt range.
const getHistory = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = { userId: req.user._id };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.bookingId) filter.bookingId = req.query.bookingId;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [transactions, total] = await Promise.all([
      LoyaltyTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      LoyaltyTransaction.countDocuments(filter),
    ]);

    res.json({
      transactions: transactions.map(t => ({
        _id: t._id,
        type: t.type,
        points: t.points,
        reason: t.reason,
        bookingId: t.bookingId,
        paymentId: t.paymentId,
        resultingBalance: t.resultingBalance,
        createdAt: t.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    console.error('getHistory error:', err);
    res.status(500).json({ error: 'Failed to load loyalty history' });
  }
};

// ─── POST /api/loyalty/redeem ──────────────────────────────────────────────────
// Body: { bookingId, points, bookingAmountInRs }. bookingAmountInRs is the
// amount being redeemed against (i.e. the booking total AFTER any tier
// discount, per the required Original → Tier discount → Points discount
// order) — required so the "can't cover 100%" rule can be enforced.
// Deducts from the redeemable currentBalance only — lifetimePoints (which
// determines tier) is never touched by a redemption.
const redeemPoints = async (req, res) => {
  try {
    const result = await runAtomic(async (session) => {
      const { bookingId, points, bookingAmountInRs } = req.body;
      const user = await User.findById(req.user._id).session(session);
      if (!user) return { status: 404, body: { error: 'User not found' } };

      const check = validateRedemption({
        currentBalance: user.loyaltyPoints || 0,
        loyaltyDebt: user.loyaltyDebt || 0,
        points,
        bookingAmountInRs,
      });
      if (!check.valid) return { status: 400, body: { message: check.message } };

      const pts = Number(points) || 0;
      user.loyaltyPoints -= pts;
      await user.save({ session });

      await LoyaltyTransaction.create([{
        userId: user._id,
        type: 'redeemed',
        points: -pts,
        reason: `Redeemed ${pts} pts for Rs. ${pts} discount`,
        bookingId: bookingId || undefined,
        resultingBalance: user.loyaltyPoints,
      }], { session });

      return {
        status: 200,
        body: {
          currentBalance: user.loyaltyPoints,
          discountAmount: check.discountAmount,
          finalAmount: check.finalAmount,
        },
      };
    });

    res.status(result.status).json(result.body);
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

    const { tier, percent, available } = getTierPerkInfo(user);
    res.json({ available, tier: tier.name, percent });
  } catch (err) {
    console.error('checkTierDiscount error:', err);
    res.status(500).json({ error: 'Failed to check tier discount' });
  }
};

// ─── POST /api/loyalty/tier-discount/apply ─────────────────────────────────────
// Body: { bookingTotal } (optional — omitted when called standalone; supplied
// when called at booking checkout, in which case the discount amount for
// that total is computed and returned). Marks the current tier's perk as
// permanently used either way.
const applyTierDiscount = async (req, res) => {
  try {
    const result = await runAtomic(async (session) => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) return { status: 404, body: { error: 'User not found' } };

      const { tier, percent, available } = getTierPerkInfo(user);
      if (!available) {
        const reason = tier.discount <= 0
          ? 'No tier discount available at your current tier'
          : !((user.tierPerksGranted || {})[tier.name])
            ? `You have not yet earned the ${tier.name} tier discount`
            : `Your ${tier.name} tier discount has already been used`;
        return { status: 400, body: { message: reason } };
      }

      const tierPerksUsed = user.tierPerksUsed || {};
      tierPerksUsed[tier.name] = true;
      user.tierPerksUsed = tierPerksUsed;
      user.markModified('tierPerksUsed');
      await user.save({ session });

      const body = { tier: tier.name, percent, applied: true };
      if (req.body?.bookingTotal !== undefined && req.body?.bookingTotal !== null) {
        const bookingTotal = Number(req.body.bookingTotal) || 0;
        body.discountAmount = Math.round(bookingTotal * tier.discount);
        body.finalAmount = Math.max(0, bookingTotal - body.discountAmount);
      }
      return { status: 200, body };
    });

    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('applyTierDiscount error:', err);
    res.status(500).json({ message: 'Failed to apply tier discount' });
  }
};

// ─── Core engine: process one successful payment ───────────────────────────────
// Not a route — called from the actual payment-success points: createBooking
// (when a booking arrives already paid, e.g. the online/COD checkout flow),
// bookingController's markCashReceived, and payhereController's IPN notify.
//
// Idempotent on paymentId: the same Payment can never award points twice,
// including across duplicate requests / webhook retries — the very first
// thing this does is check whether an 'earned' transaction already exists
// for this paymentId, and no-ops if so.
//
// amountPaid is the actual monetary amount collected for THIS specific
// payment — points are always earned on that real amount paid (after every
// discount, tier and points redemption alike), never on a pre-discount or
// pre-redemption figure. e.g. a Rs. 5000 booking where the customer redeems
// 100 points and pays Rs. 4900 earns points on Rs. 4900, not Rs. 5000.
const processSuccessfulPayment = async ({ userId, bookingId, paymentId, amountPaid }, outerSession) => {
  const run = async (session) => {
    if (!paymentId) return { earned: 0, alreadyProcessed: false, reason: 'paymentId is required' };

    const already = await LoyaltyTransaction.findOne({ paymentId, type: 'earned' }).session(session);
    if (already) return { earned: 0, alreadyProcessed: true };

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) return { earned: 0, alreadyProcessed: false, reason: 'booking not found' };

    const user = await User.findById(userId).session(session);
    if (!user) return { earned: 0, alreadyProcessed: false, reason: 'user not found' };

    const eligibleAmount = Math.max(0, Number(amountPaid) || 0);

    const tier = getTier(user.lifetimePoints || 0); // tier AT TIME OF this payment
    const earned = calculateEarnedPoints(eligibleAmount, tier);

    // Debt repayment: newly earned points repay loyaltyDebt first; only the
    // remainder (if any) adds to the spendable currentBalance. lifetimePoints
    // always increases by the FULL earned amount regardless of the split.
    const { toBalance, remainingDebt } = splitEarnedForDebtRepayment(earned, user.loyaltyDebt || 0);

    user.loyaltyDebt = remainingDebt;
    user.loyaltyPoints = (user.loyaltyPoints || 0) + toBalance;
    user.lifetimePoints = (user.lifetimePoints || 0) + earned;

    const newlyGrantedTiers = grantNewTierPerks(user);
    user.badge = getTier(user.lifetimePoints).name;
    await user.save({ session });

    booking.loyaltyPointsEarned = (booking.loyaltyPointsEarned || 0) + earned;
    await booking.save({ session });

    await LoyaltyTransaction.create([{
      userId: user._id,
      type: 'earned',
      points: earned,
      reason: `Earned for payment on booking ${booking.bookingId || ''}`.trim(),
      bookingId,
      paymentId,
      resultingBalance: user.loyaltyPoints,
    }], { session });

    for (const tierName of newlyGrantedTiers) {
      await LoyaltyTransaction.create([{
        userId: user._id,
        type: 'bonus',
        points: 0,
        reason: `${tierName} tier reached — one-time ${Math.round((TIERS.find(t => t.name === tierName)?.discount || 0) * 100)}% perk granted`,
        bookingId,
        paymentId,
      }], { session });
    }

    return {
      earned,
      alreadyProcessed: false,
      currentBalance: user.loyaltyPoints,
      lifetimePoints: user.lifetimePoints,
      loyaltyDebt: user.loyaltyDebt,
      tier: user.badge,
      newlyGrantedTiers,
    };
  };

  if (outerSession) return run(outerSession);
  return runAtomic(run);
};

// ─── POST /api/loyalty/award ────────────────────────────────────────────────────
// Body: { paymentId } — preferred, payment-anchored, fully idempotent.
// Body: { bookingId } — legacy shape, kept for backward compatibility with
// anything outside this codebase that might still call it that way (nothing
// inside this codebase does — the frontend no longer calls this endpoint at
// all, since points are now awarded automatically when the booking/payment
// is created). Resolves to that booking's most recent not-yet-processed
// Payment, or its most recent Payment at all if every one is already
// processed (in which case the call is a safe, idempotent no-op).
// Manual/retry trigger for admin or support use in the normal case — the
// real payment-success points (createBooking, markCashReceived, payhere
// notify) already process this automatically.
const awardPoints = async (req, res) => {
  try {
    const { paymentId, bookingId } = req.body;

    let payment;
    if (paymentId) {
      payment = await Payment.findById(paymentId);
      if (!payment) return res.status(404).json({ message: 'Payment not found' });
    } else if (bookingId) {
      const payments = await Payment.find({ bookingId }).sort({ createdAt: -1 });
      if (payments.length === 0) return res.status(404).json({ message: 'No payment found for this booking' });

      const processed = await LoyaltyTransaction.find({ bookingId, type: 'earned', paymentId: { $ne: null } }).select('paymentId');
      const processedIds = new Set(processed.map(t => String(t.paymentId)));
      payment = payments.find(p => !processedIds.has(String(p._id))) || payments[0];
    } else {
      return res.status(400).json({ message: 'paymentId (or bookingId) is required' });
    }

    if (String(payment.customerId) !== String(req.user._id) && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Not authorized for this payment' });
    }

    const result = await processSuccessfulPayment({
      userId: payment.customerId,
      bookingId: payment.bookingId,
      paymentId: payment._id,
      amountPaid: payment.amount,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('awardPoints error:', err);
    res.status(500).json({ message: 'Failed to award points' });
  }
};

// ─── Internal helper: reverse ALL points earned on a cancelled booking ────────
// Sums every 'earned' transaction for the booking (across however many
// separate payments it had) net of anything already reversed, so it's safe
// to call more than once (a second call finds nothing left to reverse).
// currentBalance is reduced first and can never go negative — any shortfall
// (points already redeemed) becomes loyaltyDebt instead. lifetimePoints is
// always reduced by the FULL reversed amount, and tier is recalculated down
// — but tier-perk grant history is never touched (permanent).
const reversePointsForBooking = async (bookingId, reason, outerSession) => {
  const run = async (session) => {
    if (!bookingId) return { reversed: 0 };

    const [earnedAgg, reversedAgg] = await Promise.all([
      LoyaltyTransaction.aggregate([{ $match: { bookingId: new mongoose.Types.ObjectId(bookingId), type: 'earned' } }, { $group: { _id: null, total: { $sum: '$points' } } }]).session(session),
      LoyaltyTransaction.aggregate([{ $match: { bookingId: new mongoose.Types.ObjectId(bookingId), type: 'reversed' } }, { $group: { _id: null, total: { $sum: '$points' } } }]).session(session),
    ]);
    const totalEarned = earnedAgg[0]?.total || 0;
    const alreadyReversed = Math.abs(reversedAgg[0]?.total || 0);
    const toReverse = totalEarned - alreadyReversed;
    if (toReverse <= 0) return { reversed: 0 };

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) return { reversed: 0 };
    const user = await User.findById(booking.customerId).session(session);
    if (!user) return { reversed: 0 };

    const { fromBalance, debtIncrease } = splitReversal(toReverse, user.loyaltyPoints || 0);

    user.loyaltyPoints = Math.max(0, (user.loyaltyPoints || 0) - fromBalance);
    user.loyaltyDebt = (user.loyaltyDebt || 0) + debtIncrease;
    user.lifetimePoints = Math.max(0, (user.lifetimePoints || 0) - toReverse);
    user.badge = getTier(user.lifetimePoints).name; // recalculate/downgrade — perk grant history untouched
    await user.save({ session });

    await LoyaltyTransaction.create([{
      userId: user._id,
      type: 'reversed',
      points: -toReverse,
      reason: reason || `Booking ${booking.bookingId || ''} cancelled — points reversed`.trim(),
      bookingId,
      resultingBalance: user.loyaltyPoints,
    }], { session });

    return { reversed: toReverse, debtIncurred: debtIncrease, currentBalance: user.loyaltyPoints, lifetimePoints: user.lifetimePoints, tier: user.badge };
  };

  if (outerSession) return run(outerSession);
  return runAtomic(run);
};

// ─── POST /api/loyalty/reverse (admin-only) ─────────────────────────────────────
// Manual admin-triggered reversal — identical mechanics to the automatic
// cancellation hooks in bookingController.js.
const adminReversePoints = async (req, res) => {
  try {
    const { bookingId, reason } = req.body;
    if (!bookingId) return res.status(400).json({ message: 'bookingId is required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const result = await reversePointsForBooking(bookingId, reason || `Manually reversed by admin for booking ${booking.bookingId || ''}`.trim());
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('adminReversePoints error:', err);
    res.status(500).json({ message: 'Failed to reverse points' });
  }
};

// ─── Annual reset — zeroes every account's redeemable balance ─────────────────
// Shared by POST /api/loyalty/reset-yearly (admin-only) and the Dec 31 cron
// in utils/loyalty.cron.js. lifetimePoints, loyaltyDebt, tier, and tier-perk
// history are never touched — only the redeemable currentBalance expires.
// Idempotent per calendar year via loyaltyLastExpiryYear, so re-running it
// (or a cron double-fire) doesn't create duplicate expiry transactions.
const runAnnualReset = async (targetYear) => {
  const year = targetYear || new Date().getFullYear();
  const users = await User.find({
    loyaltyPoints: { $gt: 0 },
    loyaltyLastExpiryYear: { $ne: year },
  });
  let accountsReset = 0;

  for (const user of users) {
    await runAtomic(async (session) => {
      const fresh = await User.findById(user._id).session(session);
      if (!fresh || fresh.loyaltyLastExpiryYear === year || !(fresh.loyaltyPoints > 0)) return;

      const expired = fresh.loyaltyPoints;
      fresh.loyaltyPoints = 0;
      fresh.loyaltyLastExpiryYear = year;
      await fresh.save({ session });

      await LoyaltyTransaction.create([{
        userId: fresh._id,
        type: 'expired',
        points: -expired,
        reason: `Annual points expiry (${year}) — ${expired} pts expired`,
        resultingBalance: 0,
      }], { session });

      accountsReset++;
    });
  }

  return { accountsReset, year };
};

// ─── POST /api/loyalty/reset-yearly (admin-only) ────────────────────────────────
const resetYearlyPoints = async (req, res) => {
  try {
    const result = await runAnnualReset();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('resetYearlyPoints error:', err);
    res.status(500).json({ message: 'Failed to run annual points reset' });
  }
};

module.exports = {
  getAccount, getHistory, redeemPoints, checkTierDiscount, applyTierDiscount,
  awardPoints, processSuccessfulPayment, reversePointsForBooking, adminReversePoints,
  resetYearlyPoints, runAnnualReset, getTier, TIERS, runAtomic, withPaymentRetry,
};
