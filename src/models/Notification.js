const mongoose = require('mongoose');

/**
 * MASTER NOTIFICATION MODEL
 * Replaces: Notification.js, Notification -.js
 *
 * Changes applied:
 * - userId is now ObjectId ref:'User' (was String in Notification.js)
 * - bookingId is now ObjectId ref:'Booking' (was String in Notification.js)
 * - type enum kept open (String) to allow flexibility across all members
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
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
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Booking',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
