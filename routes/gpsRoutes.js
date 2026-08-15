const express = require('express');
const router  = express.Router();
const { getActiveCleaners, updateStatus } = require('../controllers/gpsController');

router.get('/active-cleaners',            getActiveCleaners);
router.put('/cleaners/:staffId/status',   updateStatus);

module.exports = router;
