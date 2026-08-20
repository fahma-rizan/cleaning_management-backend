const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  general: {
    businessHours:      { start: { type: String, default: '09:00' }, end: { type: String, default: '18:00' } },
    operatingDays:      { type: [String], default: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] },
    cancellationPolicy: { type: String, default: '2' },
    durations:          { home: { type: Number, default: 120 }, laundry: { type: Number, default: 60 }, sofa: { type: Number, default: 90 } },
    holidays:           { type: [{ date: String, name: String }], default: [] },
  },
  business: {
    name:    { type: String, default: 'Cloud Laundry.lk' },
    address: { type: String, default: '' },
    emails:  { type: [String], default: [] },
    phones:  { type: [String], default: [] },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);