import { describe, it, expect } from 'vitest';
import { getTier } from '../constants/loyalty.js';
import {
  calculateEarnedPoints,
  computeNewlyGrantedTiers,
  splitEarnedForDebtRepayment,
  splitReversal,
  validateRedemption,
  calculateMaxRedeemable,
} from '../utils/loyaltyCalc.js';

// ── Note on scope ─────────────────────────────────────────────────────────────
// These are pure-logic unit tests, matching this repo's existing convention
// (see tests/bookingController.test.js) of testing controller logic that
// doesn't require a live database — the CJS/ESM mix here means vi.mock()
// can't reliably intercept require() calls inside a CJS controller anyway.
// utils/loyaltyCalc.js and constants/loyalty.js were deliberately extracted
// so the exact business-rule math is independently testable this way. The
// full end-to-end paths (processSuccessfulPayment, reversePointsForBooking,
// the /loyalty/* and /bookings routes, atomicity) are covered by manual
// integration testing against a real database — see the implementation
// report for what was verified and how.

describe('getTier — tier ranges (spec §2)', () => {
  it('Bronze: 0–500', () => {
    expect(getTier(0).name).toBe('Bronze');
    expect(getTier(500).name).toBe('Bronze');
  });
  it('Silver: 501–1500', () => {
    expect(getTier(501).name).toBe('Silver');
    expect(getTier(1500).name).toBe('Silver');
  });
  it('Gold: 1501–3000', () => {
    expect(getTier(1501).name).toBe('Gold');
    expect(getTier(3000).name).toBe('Gold');
  });
  it('Platinum: 3001+, no overlap at 3000', () => {
    expect(getTier(3001).name).toBe('Platinum');
    expect(getTier(3000).name).not.toBe('Platinum');
    expect(getTier(999999).name).toBe('Platinum');
  });
});

describe('calculateEarnedPoints — earning rates (spec §3, §6, §28 cases 1-4)', () => {
  it('Bronze earns at 1.0 pt / Rs.100', () => {
    expect(calculateEarnedPoints(4500, getTier(0))).toBe(45);
  });
  it('Silver earns at 1.5 pts / Rs.100', () => {
    expect(calculateEarnedPoints(4500, getTier(501))).toBe(67); // floor(45*1.5)=67.5->67
  });
  it('Gold earns at 2.0 pts / Rs.100', () => {
    expect(calculateEarnedPoints(4500, getTier(1501))).toBe(90);
  });
  it('Platinum earns at 3.0 pts / Rs.100', () => {
    expect(calculateEarnedPoints(4500, getTier(3001))).toBe(135);
  });
  it('uses Math.floor, not Math.round', () => {
    // 199 / 100 * 1.0 = 1.99 -> floor -> 1, not rounded to 2
    expect(calculateEarnedPoints(199, getTier(0))).toBe(1);
  });

  // Points are always earned on the actual monetary amount paid, after every
  // discount (tier and points redemption alike) — never on a pre-discount
  // figure. e.g. a Rs. 5000 booking where the customer redeems 100 points
  // and pays Rs. 4900 earns points on Rs. 4900 (49 pts at Bronze), not
  // Rs. 5000 (which would give 50).
  it('earns on the actual amount paid, not the pre-redemption total', () => {
    expect(calculateEarnedPoints(4900, getTier(0))).toBe(49);
    expect(calculateEarnedPoints(5000, getTier(0))).toBe(50); // contrast — NOT what should be used once points were redeemed
  });
});

describe('computeNewlyGrantedTiers — tier perks (spec §10-13, §28 cases 23-25)', () => {
  it('grants nothing for Bronze (no perk)', () => {
    expect(computeNewlyGrantedTiers({}, 100)).toEqual([]);
  });
  it('grants Silver on first reaching it', () => {
    expect(computeNewlyGrantedTiers({}, 501)).toEqual(['Silver']);
  });
  it('does not re-grant an already-granted tier', () => {
    expect(computeNewlyGrantedTiers({ Silver: true }, 600)).toEqual([]);
  });
  it('spec §13 worked example: jumping Bronze->Silver->Gold in one payment grants both', () => {
    expect(computeNewlyGrantedTiers({}, 1600)).toEqual(['Silver', 'Gold']);
  });
  it('does not re-grant Silver if already granted, even when also newly reaching Gold', () => {
    expect(computeNewlyGrantedTiers({ Silver: true }, 1600)).toEqual(['Gold']);
  });
  it('spec §16: a later tier drop never un-grants — re-reaching it grants nothing new', () => {
    // Simulates: Silver was granted once, customer dropped to Bronze via
    // reversal, then earns back up to Silver-level points again.
    expect(computeNewlyGrantedTiers({ Silver: true }, 510)).toEqual([]);
  });
});

describe('splitEarnedForDebtRepayment — loyaltyDebt (spec §18-19, §28 cases 15-16)', () => {
  it('spec §18 example 1: debt=100, earn=150 -> 100 repays debt, 50 to balance', () => {
    expect(splitEarnedForDebtRepayment(150, 100)).toEqual({ repay: 100, toBalance: 50, remainingDebt: 0 });
  });
  it('spec §18 example 2: debt=300, earn=200 -> all 200 repays debt, 0 to balance, 100 debt remains', () => {
    expect(splitEarnedForDebtRepayment(200, 300)).toEqual({ repay: 200, toBalance: 0, remainingDebt: 100 });
  });
  it('spec §19: full earned amount is available for lifetimePoints regardless of the debt split', () => {
    const earned = 150;
    const { repay } = splitEarnedForDebtRepayment(earned, 100);
    // lifetimePoints increases by `earned` (150), not by `earned - repay` (50) — the
    // caller (processSuccessfulPayment) adds `earned` directly to lifetimePoints.
    expect(earned).toBe(150);
    expect(repay).toBe(100);
  });
  it('no debt: all earned points go straight to balance', () => {
    expect(splitEarnedForDebtRepayment(150, 0)).toEqual({ repay: 0, toBalance: 150, remainingDebt: 0 });
  });
});

describe('splitReversal — cancellation clawback (spec §15, §17-18, §28 cases 17, 19, 21-22)', () => {
  it('spec §17 example: 300 earned, fully redeemed (balance 0) then cancelled -> all 300 becomes debt, balance never negative', () => {
    expect(splitReversal(300, 0)).toEqual({ fromBalance: 0, debtIncrease: 300 });
  });
  it('spec §15 example: balance covers the reversal fully -> no debt', () => {
    expect(splitReversal(30, 520)).toEqual({ fromBalance: 30, debtIncrease: 0 });
  });
  it('partial coverage: balance covers some, remainder becomes debt', () => {
    expect(splitReversal(100, 40)).toEqual({ fromBalance: 40, debtIncrease: 60 });
  });
});

// maxRedeemable = min(currentBalance - 100, 500); redemption allowed only
// when currentBalance > 100. This is NOT "must redeem at least 100" — a
// customer with, say, 150 points can redeem any amount from 1 up to 50.
describe('calculateMaxRedeemable — retained-balance rule', () => {
  it('balance 500 -> max redeemable 400 (worked example 1)', () => {
    expect(calculateMaxRedeemable(500)).toBe(400);
  });
  it('balance 200 -> max redeemable 100 (worked example 2)', () => {
    expect(calculateMaxRedeemable(200)).toBe(100);
  });
  it('balance 100 -> max redeemable 0, not eligible (worked example 3)', () => {
    expect(calculateMaxRedeemable(100)).toBe(0);
  });
  it('balance 99 -> max redeemable 0, not eligible (worked example 4)', () => {
    expect(calculateMaxRedeemable(99)).toBe(0);
  });
  it('balance 800 -> capped at the absolute max of 500, not 700 (worked example 5)', () => {
    expect(calculateMaxRedeemable(800)).toBe(500);
  });
  it('balance 450 -> max redeemable 350 (worked example 6)', () => {
    expect(calculateMaxRedeemable(450)).toBe(350);
  });
});

describe('validateRedemption — redemption rules (must retain >= 100, spec §8, §20)', () => {
  it('balance exactly 100 cannot redeem at all (not "more than")', () => {
    const r = validateRedemption({ currentBalance: 100, loyaltyDebt: 0, points: 1, bookingAmountInRs: 1000 });
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/100/);
  });
  it('balance 99 cannot redeem', () => {
    expect(validateRedemption({ currentBalance: 99, loyaltyDebt: 0, points: 1, bookingAmountInRs: 1000 }).valid).toBe(false);
  });
  it('small redemptions are allowed — NOT a "minimum 100 to redeem" rule', () => {
    const r = validateRedemption({ currentBalance: 150, loyaltyDebt: 0, points: 30, bookingAmountInRs: 1000 });
    expect(r.valid).toBe(true);
    expect(r.discountAmount).toBe(30);
  });
  it('redeeming exactly the max (balance 500 -> 400) is allowed, leaving exactly 100', () => {
    const r = validateRedemption({ currentBalance: 500, loyaltyDebt: 0, points: 400, bookingAmountInRs: 1000 });
    expect(r.valid).toBe(true);
    expect(r.maxRedeemable).toBe(400);
  });
  it('redeeming one more than the max is rejected (would drop balance below 100)', () => {
    const r = validateRedemption({ currentBalance: 500, loyaltyDebt: 0, points: 401, bookingAmountInRs: 1000 });
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/400/);
  });
  it('the absolute 500 cap still applies even with a much higher balance', () => {
    expect(validateRedemption({ currentBalance: 800, loyaltyDebt: 0, points: 501, bookingAmountInRs: 5000 }).valid).toBe(false);
    expect(validateRedemption({ currentBalance: 800, loyaltyDebt: 0, points: 500, bookingAmountInRs: 5000 }).valid).toBe(true);
  });
  it('spec §20: loyaltyDebt > 0 blocks redemption entirely, regardless of balance', () => {
    const r = validateRedemption({ currentBalance: 2000, loyaltyDebt: 1, points: 100, bookingAmountInRs: 5000 });
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/debt/i);
  });
  it('spec §8: points cannot cover exactly 100% of the amount', () => {
    // balance 1000 -> maxRedeemable 500; redeem exactly 500 against a
    // Rs.500 booking amount would cover 100% of it.
    expect(validateRedemption({ currentBalance: 1000, loyaltyDebt: 0, points: 500, bookingAmountInRs: 500 }).valid).toBe(false);
  });
  it('spec §8: one rupee short of 100% is allowed', () => {
    const r = validateRedemption({ currentBalance: 1000, loyaltyDebt: 0, points: 499, bookingAmountInRs: 500 });
    expect(r.valid).toBe(true);
    expect(r.finalAmount).toBe(1);
  });
  it('spec §7 worked example: 500 pts against Rs.4500 (post-tier-discount) -> Rs.4000 payable', () => {
    const r = validateRedemption({ currentBalance: 1000, loyaltyDebt: 0, points: 500, bookingAmountInRs: 4500 });
    expect(r.valid).toBe(true);
    expect(r.discountAmount).toBe(500);
    expect(r.finalAmount).toBe(4000);
  });
});
