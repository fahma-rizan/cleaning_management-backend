const express = require('express');
const router  = express.Router();
const {
  getRequests, getRequestByBooking, approveRequest, rejectRequest,
} = require('../controllers/materialRequestController');

router.get('/',                    getRequests);
router.get('/booking/:bookingId',  getRequestByBooking);
router.post('/:id/approve',        approveRequest);
router.post('/:id/reject',         rejectRequest);

module.exports = router;
