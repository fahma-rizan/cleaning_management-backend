// Reminds every staff member assigned to a completed booking that no
// CompletionReport has been submitted yet, once it's been overdue for
// OVERDUE_HOURS. Follows the same node-cron + hourly-check pattern as
// reminderScheduler.js (payment reminders) and loyalty.cron.js.
const cron = require('node-cron');
const Booking           = require('../models/Booking');
const CompletionReport  = require('../models/CompletionReport');
const Notification      = require('../models/Notification');

// Confirmed with the user: 24 hours after completion, matching
// reminderScheduler.js's own "overdue" threshold for payment reminders.
const OVERDUE_HOURS = 24;

const runCompletionReportReminderCheck = async () => {
  console.log(`[CompletionReportReminder] Running check at ${new Date().toISOString()}`);

  try {
    const cutoff = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000);
    // completeTask() sets taskCompletedAt, not the (unused) completedAt field.
    const overdueBookings = await Booking.find({
      status: 'completed',
      taskCompletedAt: { $lte: cutoff },
    }).select('_id bookingId assignedStaffId assignedTeam taskCompletedAt');

    if (overdueBookings.length === 0) {
      console.log('[CompletionReportReminder] No completed bookings past the 24h threshold.');
      return;
    }

    const bookingIds = overdueBookings.map(b => b._id);
    const existingReports = await CompletionReport.find({ bookingId: { $in: bookingIds } }).select('bookingId');
    const reportedSet = new Set(existingReports.map(r => r.bookingId.toString()));

    let notified = 0, skippedAlreadyReported = 0;
    for (const booking of overdueBookings) {
      if (reportedSet.has(booking._id.toString())) { skippedAlreadyReported++; continue; }

      const staffIds = new Set();
      if (booking.assignedStaffId) staffIds.add(booking.assignedStaffId.toString());
      (booking.assignedTeam || []).forEach(m => staffIds.add(m.staffId.toString()));

      for (const staffId of staffIds) {
        // One reminder per staff member per booking — an hourly cron would
        // otherwise re-notify every run until someone finally submits.
        const already = await Notification.findOne({
          userId: staffId, type: 'material-usage-reminder', bookingId: booking._id.toString(),
        });
        if (already) continue;

        await Notification.create({
          userId:  staffId,
          type:    'material-usage-reminder',
          title:   'Material usage report overdue',
          message: `Booking ${booking.bookingId} was marked completed over 24 hours ago and still has no material usage report.`,
          bookingId:  booking._id.toString(),
          actionUrl:  `/staff/complete-service/${booking._id}`,
        });
        notified++;
      }
    }

    console.log(`[CompletionReportReminder] Done — ${notified} notification(s) sent, ${skippedAlreadyReported} booking(s) already reported, ${overdueBookings.length} overdue booking(s) checked.`);
  } catch (err) {
    console.error('[CompletionReportReminder] Fatal error during reminder check:', err.message);
  }
};

const startCompletionReportReminderCron = () => {
  console.log(`[CompletionReportReminder] Scheduler started — runs every hour, ${OVERDUE_HOURS}h overdue threshold`);
  runCompletionReportReminderCheck(); // catch anything already overdue right away on startup
  cron.schedule('0 * * * *', runCompletionReportReminderCheck);
};

module.exports = { startCompletionReportReminderCron, runCompletionReportReminderCheck };
