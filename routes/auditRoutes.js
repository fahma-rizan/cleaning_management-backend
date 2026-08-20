const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { logAction } = require('../controllers/auditController');

router.post('/log', protect, logAction);

module.exports = router;
