const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requestRefund, approveRefund, rejectRefund, getRefunds } = require('../controllers/refundController');

router.get('/',            protect, getRefunds);
router.post('/request',    protect, requestRefund);
router.post('/approve/:id', protect, approveRefund);
router.post('/reject/:id',  protect, rejectRefund);

module.exports = router;
