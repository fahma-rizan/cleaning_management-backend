// ─── Loyalty program constants — single source of truth ───────────────────────
// Every backend file that needs tier thresholds/rates/discounts must require
// this module instead of redefining its own copy. The frontend keeps its own
// mirror for rendering (src/app/lib/loyaltyTiers.ts, a TypeScript file that
// can't literally share this module) — keep the two in sync by hand.
//
// Tiers are based on LIFETIME points (never reset); the redeemable balance
// is separate and is zeroed out every Dec 31 (see utils/loyalty.cron.js).
const TIERS = [
  { name: 'Bronze',   min: 0,    max: 500,      discount: 0,    earningRate: 1.0 },
  { name: 'Silver',   min: 501,  max: 1500,     discount: 0.05, earningRate: 1.5 },
  { name: 'Gold',     min: 1501, max: 3000,     discount: 0.10, earningRate: 2.0 },
  { name: 'Platinum', min: 3001, max: Infinity, discount: 0.15, earningRate: 3.0 },
];

// Redemption: 1 point = Rs. 1.
const REDEEM_RATE = 1;
// The customer must always keep at least this many points in currentBalance
// — both as the entry condition (currentBalance must be MORE than this to
// redeem at all) and as the floor after redeeming (currentBalance minus
// whatever's redeemed must still be at least this). NOT a minimum
// redemption amount — a customer with, say, 150 points can redeem anywhere
// from 1 up to 50 points; they just can never drop below 100 in the tank.
const MIN_RETAINED_BALANCE = 100;
// ...and never more than this many points against a single booking, even if
// currentBalance - MIN_RETAINED_BALANCE is higher.
const MAX_REDEEM_POINTS_PER_BOOKING = 500;

const getTier = (lifetimePoints = 0) =>
  [...TIERS].reverse().find(t => lifetimePoints >= t.min) || TIERS[0];

module.exports = { TIERS, getTier, REDEEM_RATE, MIN_RETAINED_BALANCE, MAX_REDEEM_POINTS_PER_BOOKING };
