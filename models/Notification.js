const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId:  { type: String, required: true, index: true }, // User._id as string
    type: {
      type: String,
      required: true,
      // Kept loose (not a strict enum) so new notification types added on the
      // frontend never get silently rejected by the backend.
    },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    read:    { type: Boolean, default: false },
    bookingId:   { type: String },
    actionUrl:   { type: String },
    complaintId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
