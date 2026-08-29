const mongoose = require('mongoose');

/**
 * MASTER NOTIFICATION MODEL
 *
 * userId / bookingId are Strings so demo accounts (admin-001, user-001) and
 * human-readable booking IDs (BK-2026-001) persist. Real Mongo ObjectIds
 * still work as 24-char hex strings.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type:     String,
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      required: true,
    },
    title: {
      type:     String,
      required: true,
    },
    message: {
      type:     String,
      required: true,
    },
    read: {
      type:    Boolean,
      default: false,
    },
    actionUrl: {
      type: String,
    },
    bookingId: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);