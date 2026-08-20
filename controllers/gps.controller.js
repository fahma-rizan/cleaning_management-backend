const GpsLocation = require('../models/GpsLocation');

exports.getActiveCleaners = async (req, res) => {
  try {
    const cleaners = await GpsLocation.find({ status: { $ne: 'Offline' } }).sort({ updatedAt: -1 });
    res.json(cleaners);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, latitude, longitude, eta, customerName, customerAddress, currentJob } = req.body;
    const updated = await GpsLocation.findOneAndUpdate({ staffId: req.params.id }, { $set: { status, latitude, longitude, eta, customerName, customerAddress, currentJob } }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Location not found' });
    const io = req.app.get('io');
    if (io && updated.status !== 'Completed') io.emit('cleaner-location-update', updated);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};