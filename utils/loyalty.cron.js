const cron = require('node-cron');
const { runAnnualReset } = require('../controllers/loyaltyController');

// Zeroes every customer's redeemable loyalty balance once a year — see
// runAnnualReset() in loyaltyController.js for exactly what it does and
// doesn't touch. '59 23 31 12 *' = 23:59 on Dec 31 every year — minute(59)
// hour(23) day-of-month(31) month(12) day-of-week(*). Dec 31 is a real
// calendar date every year (unlike, say, Feb 30), so this reliably fires.
const LOYALTY_RESET_CRON = '59 23 31 12 *';

const startLoyaltyCron = () => {
  cron.schedule(LOYALTY_RESET_CRON, async () => {
    console.log('[Loyalty] Running annual points reset...');
    try {
      const result = await runAnnualReset();
      console.log(`[Loyalty] Annual reset complete — ${result.accountsReset} account(s) reset.`);
    } catch (err) {
      console.error('[Loyalty] Annual reset failed:', err);
    }
  });
  console.log('[Loyalty] Cron scheduled — annual points reset runs Dec 31 at 23:59');
};

module.exports = { startLoyaltyCron, LOYALTY_RESET_CRON };
