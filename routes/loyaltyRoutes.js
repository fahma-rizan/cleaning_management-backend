const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getAccount, getHistory, redeemPoints, checkTierDiscount, applyTierDiscount,
} = require('../controllers/loyaltyController');

router.use(protect); // all loyalty routes are per-user, must be authenticated

router.get('/account',               getAccount);
router.get('/history',               getHistory);
router.post('/redeem',               redeemPoints);
router.get('/tier-discount',         checkTierDiscount);
router.post('/tier-discount/apply',  applyTierDiscount);

module.exports = router;
