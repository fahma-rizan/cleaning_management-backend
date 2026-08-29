const cron = require('node-cron');
const Booking = require('../models/Booking');
const Feedback = require('../models/Feedback');
const ScheduledNotificationLog = require('../models/ScheduledNotificationLog');
const { sendPreCleaningReminderEmail, sendFeedbackNudgeEmail } = require('./emailService');

/**
 * SERVICE REMINDER SCHEDULER (task #22 — Notification C.4 / C.6)
 *
 * Two more scheduled notifications the audit found entirely missing —
 * reminderScheduler.js only ever handled the payment-due balance reminder
 * (C.5). Follows the exact same shape (node-cron, run-once-on-startup +
 * hourly, a dedupe log so nothing gets sent twice) rather than inventing a
 * new pattern.
 *
 * C.4 — Pre-cleaning reminder: nudge the customer a day ahead of their
 *        scheduled booking.
 * C.6 — Feedback nudge: ~3 days after a job completes, if the customer
 *        hasn't left feedback yet (task #21's new Feedback model), ask them to.
 */

const CONFIG = {
  preCleaningReminderHours: 24, // send when the booking is within this many hours
  feedbackNudgeAfterDays:   3,  // send this many days after completion
  feedbackNudgeWindowDays:  30, // don't bother nudging for jobs older than this
};

// booking.date is 'YYYY-MM-DD'; booking.time is a range like '9:00AM - 11:00AM'.
// Parses the start of that range into a real Date. Falls back to 9:00AM on the
// booking date if the time string doesn't parse — a reminder a few hours off
// is far better than silently never sending one.
const parseBookingStart = (booking) => {
  if (!booking.date) return null;
  const [y, m, d] = booking.date.split('-').map(Number);
  if (!y || !m || !d) return null;

  let hours = 9;
  let minutes = 0;
  const timeMatch = (booking.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    const meridiem = timeMatch[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }
  return new Date(y, m - 1, d, hours, minutes);
};

const alreadySent = async (bookingId, type) => {
  const existing = await ScheduledNotificationLog.findOne({ bookingId, type });
  return !!existing;
};

// ── C.4: Pre-cleaning reminder ──────────────────────────────────────────────
const runPreCleaningReminders = async () => {
  const now = new Date();
  let sent = 0, skipped = 0;

  try {
    const bookings = await Booking.find({
      status: { $in: ['pending', 'confirmed', 'in-progress'] },
    });

    for (const booking of bookings) {
      try {
        const start = parseBookingStart(booking);
        if (!start) { skipped++; continue; }

        const hoursUntil = (start - now) / (1000 * 60 * 60);
        // Window: due within the reminder threshold, but not already in the past.
        if (hoursUntil > CONFIG.preCleaningReminderHours || hoursUntil < 0) { skipped++; continue; }

        if (await alreadySent(booking._id, 'PRE_CLEANING_REMINDER')) { skipped++; continue; }

        await sendPreCleaningReminderEmail(booking);
        await ScheduledNotificationLog.create({ bookingId: booking._id, type: 'PRE_CLEANING_REMINDER' });
        sent++;
      } catch (bookingErr) {
        console.error(`[ServiceReminders] Pre-cleaning reminder failed for booking ${booking.bookingId}:`, bookingErr.message);
      }
    }

    console.log(`[ServiceReminders] Pre-cleaning reminders — sent: ${sent}, skipped: ${skipped}`);
  } catch (err) {
    console.error('[ServiceReminders] Fatal error during pre-cleaning reminder check:', err.message);
  }
};

// ── C.6: Feedback nudge ──────────────────────────────────────────────────────
const runFeedbackNudges = async () => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.feedbackNudgeWindowDays * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() - CONFIG.feedbackNudgeAfterDays  * 24 * 60 * 60 * 1000);
  let sent = 0, skipped = 0;

  try {
    const bookings = await Booking.find({
      status: 'completed',
      taskCompletedAt: { $gte: windowStart, $lte: windowEnd },
    });

    for (const booking of bookings) {
      try {
        if (await alreadySent(booking._id, 'FEEDBACK_NUDGE')) { skipped++; continue; }

        // Skip if the customer already left feedback (of either type) on their own.
        const existingFeedback = await Feedback.findOne({ booking: booking._id });
        if (existingFeedback) {
          // Log it anyway so we don't keep re-checking this booking every run.
          await ScheduledNotificationLog.create({ bookingId: booking._id, type: 'FEEDBACK_NUDGE' }).catch(() => {});
          skipped++;
          continue;
        }

        await sendFeedbackNudgeEmail(booking);
        await ScheduledNotificationLog.create({ bookingId: booking._id, type: 'FEEDBACK_NUDGE' });
        sent++;
      } catch (bookingErr) {
        console.error(`[ServiceReminders] Feedback nudge failed for booking ${booking.bookingId}:`, bookingErr.message);
      }
    }

    console.log(`[ServiceReminders] Feedback nudges — sent: ${sent}, skipped: ${skipped}`);
  } catch (err) {
    console.error('[ServiceReminders] Fatal error during feedback nudge check:', err.message);
  }
};

const runServiceReminderCheck = async () => {
  console.log(`[ServiceReminders] Running service reminder check at ${new Date().toISOString()}`);
  await runPreCleaningReminders();
  await runFeedbackNudges();
};

// Runs every hour at minute 15 (offset from the balance reminder's minute 0
// so the two don't hit the DB in the same instant).
const startServiceReminderScheduler = () => {
  console.log('[ServiceReminders] Scheduler started — runs every hour');

  runServiceReminderCheck();

  cron.schedule('15 * * * *', runServiceReminderCheck);
};

module.exports = {
  startServiceReminderScheduler,
  runServiceReminderCheck,
  runPreCleaningReminders,
  runFeedbackNudges,
};
