const express = require('express');
const router  = express.Router();
const { optionalAuth } = require('../middleware/authMiddleware');
const { generateHash, notify } = require('../controllers/payhereController');

// optionalAuth: PaymentGatewayPage.tsx sends `x-auth-token`, which optionalAuth
// understands, but we don't hard-fail the checkout if it's missing/stale.
router.post('/generate-hash', optionalAuth, generateHash);

// PayHere's server-to-server webhook — never authenticated by our own JWT,
// verified instead via the md5sig PayHere signs the payload with.
router.post('/notify', notify);

module.exports = router;
