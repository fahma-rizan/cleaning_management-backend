const User = require('../models/User');

const toCleaner = (u) => ({
  _id:             u._id,
  staffId:         u._id,
  staffName:       u.name,
  latitude:        u.currentLat || 0,
  longitude:       u.currentLng || 0,
  status:          u.gpsStatus || 'Offline',
  currentJob:      u.gpsCurrentJob || '',
  customerName:    u.gpsCustomerName || '',
  customerAddress: u.gpsCustomerAddress || '',
  eta:             u.gpsEta || '',
  updatedAt:       u.gpsUpdatedAt ? u.gpsUpdatedAt.toISOString() : '',
});

// ─── GET /api/gps/active-cleaners ──────────────────────────────────────────────────
const getActiveCleaners = async (req, res) => {
  try {
    const staff = await User.find({
      role: 'staff',
      gpsStatus: { $in: ['On the Way', 'On Site'] },
    });
    res.json(staff.map(toCleaner));
  } catch (err) {
    console.error('getActiveCleaners error:', err);
    res.status(500).json({ error: 'Failed to load active cleaners' });
  }
};

// ─── PUT /api/gps/cleaners/:staffId/status ─────────────────────────────────────────
// Updates a staff member's live location/status and broadcasts it over Socket.IO
// so any connected GPSTracking dashboards update in real time.
const updateStatus = async (req, res) => {
  try {
    const { status, latitude, longitude, eta, customerName, currentJob } = req.body;
    const staff = await User.findOne({ _id: req.params.staffId, role: 'staff' });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    if (status !== undefined)       staff.gpsStatus       = status;
    if (latitude !== undefined)     staff.currentLat      = latitude;
    if (longitude !== undefined)    staff.currentLng      = longitude;
    if (eta !== undefined)          staff.gpsEta          = eta;
    if (customerName !== undefined) staff.gpsCustomerName = customerName;
    if (currentJob !== undefined)   staff.gpsCurrentJob   = currentJob;
    staff.gpsUpdatedAt = new Date();

    await staff.save();

    const cleaner = toCleaner(staff);

    // Broadcast to any connected admin GPS dashboards
    const io = req.app.get('io');
    if (io) io.emit('cleaner-location-update', cleaner);

    res.json(cleaner);
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ error: 'Failed to update GPS status' });
  }
};

module.exports = { getActiveCleaners, updateStatus };
