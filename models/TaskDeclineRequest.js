const mongoose = require('mongoose');

// A staff member's request to decline an assigned task — the task stays
// assigned to them until an admin approves the request. Only on approval
// does the booking actually get reassigned/unassigned.
const taskDeclineRequestSchema = new mongoose.Schema(
  {
    bookingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    bookingRef: { type: String }, // Booking.bookingId, denormalised for display

    staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    staffName:  { type: String },
    staffEmail: { type: String },

    reason: { type: String, required: true, trim: true },

    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    reviewedBy: { type: String },
    reviewNote: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TaskDeclineRequest', taskDeclineRequestSchema);
