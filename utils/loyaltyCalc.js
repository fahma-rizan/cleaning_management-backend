// ─── Pure loyalty calculation helpers — no DB access, fully unit-testable ──────
// Extracted out of loyaltyController.js so the exact business-rule math (point
// earning, debt repayment split, reversal split, tier-perk grants, redemption
// validation) can be tested in isolation, the same way the rest of this repo's
// test suite tests pure guard logic without mocking Mongoose. See
// tests/loyaltyCalc.test.js.
const { TIERS, MIN_RETAINED_BALANCE, MAX_REDEEM_POINTS_PER_BOOKING, REDEEM_RATE } = require('../constants/loyalty');

// Math.floor((amountPaid / 100) × tierEarningRate), per the loyalty spec.
const calculateEarnedPoints = (eligibleAmount, tier) =>
  Math.floor((Math.max(0, Number(eligibleAmount) || 0) / 100) * tier.earningRate);

// Which tiers (in TIERS order) are newly reachable at `lifetimePoints` but not
// yet present in `grantedMap` — i.e. every perk that should be granted right
// now, correctly handling a single payment that jumps over multiple tiers.
const computeNewlyGrantedTiers = (grantedMap, lifetimePoints) => {
  const granted = grantedMap || {};
  const newly = [];
  for (const t of TIERS) {
    if (t.discount > 0 && t.min <= (lifetimePoints || 0) && !granted[t.name]) newly.push(t.name);
  }
  return newly;
};

// Newly-earned points repay any outstanding loyaltyDebt first; only the
// remainder adds to the spendable balance. The caller must still add the
// FULL `earned` amount to lifetimePoints regardless of this split.
const splitEarnedForDebtRepayment = (earned, currentDebt) => {
  const debt = currentDebt || 0;
  const repay = Math.min(debt, earned);
  return { repay, toBalance: earned - repay, remainingDebt: debt - repay };
};

// Reversing `toReverse` points: take as much as possible from currentBalance
// (never negative), and whatever's left becomes/increases loyaltyDebt.
const splitReversal = (toReverse, currentBalance) => {
  const fromBalance = Math.min(toReverse, currentBalance || 0);
  return { fromBalance, debtIncrease: toReverse - fromBalance };
};

// The most a customer with this currentBalance could ever redeem in one
// booking: keep at least MIN_RETAINED_BALANCE in the tank, and never more
// than MAX_REDEEM_POINTS_PER_BOOKING regardless. Never negative.
const calculateMaxRedeemable = (currentBalance) =>
  Math.max(0, Math.min((currentBalance || 0) - MIN_RETAINED_BALANCE, MAX_REDEEM_POINTS_PER_BOOKING));

// All the redeemPoints business-rule checks, independent of any DB access.
// currentBalance must be MORE than MIN_RETAINED_BALANCE to redeem at all —
// this is NOT a minimum redemption amount, it's a floor the balance can
// never drop below. A customer can redeem any positive number of points up
// to calculateMaxRedeemable(currentBalance).
const validateRedemption = ({ currentBalance, loyaltyDebt, points, bookingAmountInRs }) => {
  if ((loyaltyDebt || 0) > 0) {
    return { valid: false, message: 'Cannot redeem points while a loyalty debt is outstanding — it must be repaid by future earned points first.' };
  }
  const balance = currentBalance || 0;
  if (balance <= MIN_RETAINED_BALANCE) {
    return { valid: false, message: `You need more than ${MIN_RETAINED_BALANCE} points to redeem — your balance must always stay at or above ${MIN_RETAINED_BALANCE}.` };
  }
  const maxRedeemable = calculateMaxRedeemable(balance);
  const pts = Number(points) || 0;
  if (pts <= 0) {
    return { valid: false, message: 'Enter a positive number of points to redeem' };
  }
  if (pts > maxRedeemable) {
    return { valid: false, message: `You can redeem at most ${maxRedeemable} points — your balance must always stay at or above ${MIN_RETAINED_BALANCE}.` };
  }
  if (bookingAmountInRs === undefined || bookingAmountInRs === null) {
    return { valid: false, message: 'bookingAmountInRs is required' };
  }
  const amount = Number(bookingAmountInRs) || 0;
  const discountAmount = pts * REDEEM_RATE;
  if (discountAmount >= amount) {
    return { valid: false, message: 'Points cannot cover the entire booking amount — a positive amount must remain payable' };
  }
  return { valid: true, discountAmount, finalAmount: Math.max(0, amount - discountAmount), maxRedeemable };
};

module.exports = {
  calculateEarnedPoints, computeNewlyGrantedTiers, splitEarnedForDebtRepayment,
  splitReversal, validateRedemption, calculateMaxRedeemable,
};
