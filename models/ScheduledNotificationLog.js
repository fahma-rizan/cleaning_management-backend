const mongoose = require('mongoose');

/**
 * SCHEDULED NOTIFICATION LOG (task #22, C.4 / C.6)
 *
 * Generic dedupe record for the cron-driven service reminders
 * (serviceReminderScheduler.js) — one row per (booking, reminder type) so a
 * booking never gets the same pre-cleaning reminder or feedback nudge twice,
 * the same way PaymentReminder already does for balance-due emails.
 */
const scheduledNotificationLogSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['PRE_CLEANING_REMINDER', 'FEEDBACK_NUDGE'],
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One reminder of a given type per booking, ever.
scheduledNotificationLogSchema.index({ bookingId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('ScheduledNotificationLog', scheduledNotificationLogSchema);
