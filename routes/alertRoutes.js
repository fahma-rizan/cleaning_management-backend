const express = require('express');
const router  = express.Router();
const { getActiveAlerts, getAlertHistory } = require('../controllers/alertController');

// 'history' must be registered before any '/:id' pattern (none here currently, but future-proof)
router.get('/history', getAlertHistory);
router.get('/',        getActiveAlerts);

module.exports = router;
