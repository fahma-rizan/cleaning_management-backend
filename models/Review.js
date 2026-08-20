const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  bookingId:    { type: String, required: true, unique: true },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true },
  serviceName:  { type: String, required: true },
  rating:       { type: Number, required: true, min: 1, max: 5 },
  content:      { type: String, default: '' },
  status:       { type: String, enum: ['Pending', 'Approved', 'Hidden'], default: 'Pending' },
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);