/**
 * One-off data fix: authController.js used to hardcode `badge: 'Silver'`
 * on every new customer at registration time (both email/OTP signup and
 * first-time Google sign-in), regardless of loyaltyPoints/lifetimePoints —
 * so brand-new customers with 0 points showed as "Silver" instead of
 * "Bronze". That bug is fixed in authController.js; this script recomputes
 * `badge` for every existing customer from their actual lifetimePoints,
 * using the same tier thresholds as the rest of the app (constants/loyalty.js).
 *
 * Command: node scripts/fixCustomerBadges.js   (from the backend root)
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/db');
const User = require('../models/User');
const { getTier } = require('../constants/loyalty');

(async () => {
  await connectDB();

  const customers = await User.find({ role: 'customer' }).select('_id name lifetimePoints badge');

  let fixed = 0;
  for (const user of customers) {
    const correctBadge = getTier(user.lifetimePoints || 0).name;
    if (user.badge !== correctBadge) {
      console.log(`${user.name} (${user._id}): ${user.badge || '(none)'} -> ${correctBadge} [lifetimePoints=${user.lifetimePoints || 0}]`);
      user.badge = correctBadge;
      await user.save();
      fixed++;
    }
  }

  console.log(`\nChecked ${customers.length} customer(s), fixed ${fixed}.`);
  process.exit(0);
})().catch((err) => {
  console.error('fixCustomerBadges failed:', err);
  process.exit(1);
});
