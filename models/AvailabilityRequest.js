const mongoose = require('mongoose');

// A staff member's request to be marked Unavailable — must be approved by an
// admin before staff.isAvailable actually flips. Ending a leave early
// (going back to Available) does NOT need approval and is handled directly
// on the User document, not through this model.
const availabilityRequestSchema = new mongoose.Schema(
  {
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

module.exports = mongoose.model('AvailabilityRequest', availabilityRequestSchema);
