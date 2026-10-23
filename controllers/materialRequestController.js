const MaterialRequest = require('../models/MaterialRequest');
const { confirmMaterialRequest } = require('../services/materialRequestService');

const toResponse = (req) => {
  const b = req.bookingId || {};
  return {
    _id: req._id,
    bookingId: {
      _id:          b._id || '',
      bookingRef:   b.bookingId || '',
      customerName: b.customerName || '',
      scheduledDate: b.date || '',
      serviceType:  b.serviceCategory || b.serviceName || '',
    },
    serviceId: req.serviceId,
    items: req.items,
    status: req.status,
    cancelledAfterConfirmation: req.cancelledAfterConfirmation,
    createdAt: req.createdAt,
  };
};

// ─── GET /api/material-requests ────────────────────────────────────────────────
// status is optional — 'all' (or omitted) returns every request, matching the
// Material Requests tab's All/Pending/Confirmed/Cancelled sub-tabs.
const getRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const requests = await MaterialRequest.find(filter)
      .populate('bookingId')
      .sort({ createdAt: -1 });

    res.json({ requests: requests.map(toResponse) });
  } catch (err) {
    console.error('getRequests error:', err);
    res.status(500).json({ error: 'Failed to load material requests' });
  }
};

// ─── GET /api/material-requests/booking/:bookingId ─────────────────────────────
const getRequestByBooking = async (req, res) => {
  try {
    const request = await MaterialRequest.findOne({ bookingId: req.params.bookingId }).populate('bookingId');
    if (!request) return res.status(404).json({ error: 'No material request found for this booking' });
    res.json(toResponse(request));
  } catch (err) {
    console.error('getRequestByBooking error:', err);
    res.status(500).json({ error: 'Failed to load material request' });
  }
};

// ─── POST /api/material-requests/:id/confirm ───────────────────────────────────
// No reject flow — low stock is surfaced as a non-blocking `warnings` array,
// the request always ends up confirmed and stock is always deducted.
const confirmRequest = async (req, res) => {
  try {
    const { request, warnings } = await confirmMaterialRequest(req.params.id);
    const populated = await request.populate('bookingId');
    res.json({ ...toResponse(populated), warnings });
  } catch (err) {
    console.error('confirmRequest error:', err);
    const status = err.message === 'Material request not found' ? 404
      : err.message === 'Only pending material requests can be confirmed' ? 400
      : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to confirm request' : err.message });
  }
};

module.exports = { getRequests, getRequestByBooking, confirmRequest };
