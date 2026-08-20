const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  requestReduction, approveReduction, rejectReduction, getReductions,
} = require('../controllers/priceReductionController');

router.get('/',             protect, getReductions);
router.post('/request',     protect, requestReduction);
router.post('/approve/:id', protect, approveReduction);
router.post('/reject/:id',  protect, rejectReduction);

module.exports = router;
