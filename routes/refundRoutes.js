const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { requestRefund, approveRefund, rejectRefund, getRefunds } = require('../controllers/refundController');

router.get('/',            protect, adminOnly, getRefunds);
router.post('/request',    protect, requestRefund);
router.post('/approve/:id', protect, adminOnly, approveRefund);
router.post('/reject/:id',  protect, adminOnly, rejectRefund);

module.exports = router;
