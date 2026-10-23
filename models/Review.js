const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    bookingId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String },
    serviceName:  { type: String },
    staffId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    staffName:    { type: String },
    // For team bookings (Booking.assignedTeam), every team member gets
    // credit for the same rating — staffId/staffName above hold the first
    // one for simple/backward-compatible display; staffIds/staffNames hold
    // the full list so each team member's own rating aggregation includes
    // this review, not just one arbitrarily-chosen member.
    staffIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    staffNames:   [{ type: String }],

    rating:  { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, trim: true },

    status: {
      type:    String,
      enum:    ['Pending', 'Approved', 'Hidden'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);