const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { send } = require('../controllers/emailController');

router.post('/send', protect, send);

module.exports = router;
