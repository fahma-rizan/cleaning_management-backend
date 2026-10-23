const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  requestReduction, approveReduction, rejectReduction, getReductions,
} = require('../controllers/priceReductionController');

router.get('/',             protect, adminOnly, getReductions);
router.post('/request',     protect, requestReduction);
router.post('/approve/:id', protect, adminOnly, approveReduction);
router.post('/reject/:id',  protect, adminOnly, rejectReduction);

module.exports = router;
