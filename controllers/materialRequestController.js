const MaterialRequest = require('../models/MaterialRequest');
const Booking = require('../models/Booking');

const toResponse = (req) => {
  const b = req.bookingId || {};
  return {
    _id: req._id,
    bookingId: {
      bookingRef:   b.bookingId || '',
      customerId:   { name: b.customerName || '' },
      scheduledDate: b.date || '',
      serviceType:  b.serviceCategory || b.serviceName || '',
      usageFactor:       b.houseSize ? 'house_size' : (b.mattressCount ? 'mattress_count' : ''),
      usageFactorValue:  b.houseSize || b.mattressCount || b.sofaSeatingCapacity || '',
    },
    items: req.items,
    status: req.status,
    rejectionReason: req.rejectionReason,
    createdAt: req.createdAt,
  };
};

// ─── GET /api/material-requests ────────────────────────────────────────────────
const getRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

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

// ─── POST /api/material-requests/:id/approve ───────────────────────────────────
const approveRequest = async (req, res) => {
  try {
    const request = await MaterialRequest.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedAt: new Date() },
      { new: true }
    ).populate('bookingId');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(toResponse(request));
  } catch (err) {
    console.error('approveRequest error:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
};

// ─── POST /api/material-requests/:id/reject ────────────────────────────────────
const rejectRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await MaterialRequest.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectionReason: reason || '' },
      { new: true }
    ).populate('bookingId');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(toResponse(request));
  } catch (err) {
    console.error('rejectRequest error:', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
};

module.exports = { getRequests, getRequestByBooking, approveRequest, rejectRequest };
