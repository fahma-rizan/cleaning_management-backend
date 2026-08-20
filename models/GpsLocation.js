const mongoose = require('mongoose');

const GpsLocationSchema = new mongoose.Schema({
  staffId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, unique: true },
  staffName:       { type: String, required: true },
  latitude:        { type: Number, default: 6.9271 },
  longitude:       { type: Number, default: 79.8612 },
  status:          { type: String, enum: ['On the Way', 'On Site', 'Completed', 'Offline'], default: 'Offline' },
  currentJob:      { type: String, default: '' },
  customerName:    { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  eta:             { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('GpsLocation', GpsLocationSchema);