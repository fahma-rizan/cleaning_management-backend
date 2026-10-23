const express = require('express');
const router  = express.Router();
const { chatWithBot } = require('../controllers/chatbotController');

// Public — the customer-facing service finder widget calls this before login.
router.post('/chat', chatWithBot);

module.exports = router;
