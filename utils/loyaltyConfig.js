/**
 * Loyalty Points Configuration
 *
 * A.2 Loyalty Points — Burn & Redeem Logic
 * =========================================
 * The conversion rate between loyalty points and monetary discount is
 * configurable here (or overridden via the LOYALTY_POINTS_PER_RUPEE
 * env var in .env).
 *
 * Default: 100 points = Rs. 1 (i.e. each point is worth Re. 0.01)
 * Admin can change this rate without touching application code.
 */

// ── Configurable conversion rate ─────────────────────────────────────────────
// Points needed to get Re. 1 discount.
const DEFAULT_POINTS_PER_RUPEE = 100; // 100 points = Rs. 1

const POINTS_PER_RUPEE = parseInt(
  process.env.LOYALTY_POINTS_PER_RUPEE || DEFAULT_POINTS_PER_RUPEE,
  10
) || DEFAULT_POINTS_PER_RUPEE;

// ── Configurable earning rate ────────────────────────────────────────────────
// Points earned per Rs. 1 spent (default: 0.1 → Rs. 100 spent = 10 points)
const DEFAULT_POINTS_PER_RUPEE_SPENT = 0.1;
const POINTS_PER_RUPEE_SPENT = parseFloat(
  process.env.LOYALTY_POINTS_PER_RUPEE_SPENT || DEFAULT_POINTS_PER_RUPEE_SPENT
) || DEFAULT_POINTS_PER_RUPEE_SPENT;

/**
 * Convert loyalty points to a monetary discount amount.
 * @param {number} points - Number of loyalty points to burn
 * @returns {number} Discount amount in rupees (rounded to 2 decimals)
 *
 * Example: 500 points ÷ 100 (points per rupee) = Rs. 5.00 discount
 */
const pointsToRupees = (points) => {
  if (!points || points <= 0) return 0;
  return parseFloat((points / POINTS_PER_RUPEE).toFixed(2));
};

/**
 * Convert a monetary amount to loyalty points earned.
 * @param {number} amount - Amount spent in rupees
 * @returns {number} Loyalty points earned (rounded down)
 *
 * Example: Rs. 1000 × 0.1 (points per rupee spent) = 100 points
 */
const rupeesToPoints = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount * POINTS_PER_RUPEE_SPENT);
};

/**
 * Convert a monetary amount to loyalty points that can be BURNED.
 * The customer cannot burn more points than they have.
 * @param {number} points - Customer's current loyalty points balance
 * @param {number} totalAmount - The total amount being checked out
 * @returns {number} Maximum points the customer can burn (cannot exceed their balance)
 */
const maxBurnablePoints = (points, totalAmount) => {
  // A customer can never burn more rupees than the total amount.
  // So the cap is: totalAmount * POINTS_PER_RUPEE
  const maxByAmount = Math.floor(totalAmount * POINTS_PER_RUPEE);
  return Math.min(points || 0, maxByAmount);
};

module.exports = {
  POINTS_PER_RUPEE,
  POINTS_PER_RUPEE_SPENT,
  pointsToRupees,
  rupeesToPoints,
  maxBurnablePoints,
};
