const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getAccount, getHistory, redeemPoints, checkTierDiscount, applyTierDiscount,
  awardPoints, adminReversePoints, resetYearlyPoints,
} = require('../controllers/loyaltyController');

router.use(protect); // all loyalty routes are per-user, must be authenticated

router.get('/account',               getAccount);
router.get('/history',               getHistory);
router.post('/award',                awardPoints);
router.post('/redeem',               redeemPoints);
router.get('/tier-discount',         checkTierDiscount);
router.post('/tier-discount/apply',  applyTierDiscount);

router.post('/reverse',              adminOnly, adminReversePoints);
router.post('/reset-yearly',         adminOnly, resetYearlyPoints);

module.exports = router;
