const cron = require('node-cron');
const Invoice = require('../models/Invoice');
const PaymentReminder = require('../models/PaymentReminder');
const { sendBalanceReminderEmail } = require('../utils/emailService');

// Reminder schedule config (days before assumed due date, or hours after)
const CONFIG = {
  firstReminderDays:    7,
  secondReminderDays:   3,
  finalReminderDays:    1,
  overdueReminderHours: 24,
};

// Assumed due date = invoice creation + 7 days (adjustable per business rule)
const getAssumedDueDate = (invoice) =>
  new Date(new Date(invoice.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000);

// Which reminder type should be sent right now for this invoice?
const determineReminderType = (invoice, now) => {
  const dueDate = getAssumedDueDate(invoice);
  const msLeft  = dueDate - now;
  const daysLeft  = msLeft / (1000 * 60 * 60 * 24);
  const hoursLeft = msLeft / (1000 * 60 * 60);

  if (hoursLeft < -CONFIG.overdueReminderHours) return 'overdue';
  if (daysLeft <= CONFIG.finalReminderDays   && daysLeft > 0)                               return 'final';
  if (daysLeft <= CONFIG.secondReminderDays  && daysLeft > CONFIG.finalReminderDays)         return 'second';
  if (daysLeft <= CONFIG.firstReminderDays   && daysLeft > CONFIG.secondReminderDays)        return 'first';
  return null;
};

// Has this reminder type already been sent for this invoice?
const hasAlreadySentReminder = async (invoiceId, reminderType) => {
  const existing = await PaymentReminder.findOne({ invoiceId, reminderType });
  return !!existing;
};

// Core logic — run once per hour
const runReminderCheck = async () => {
  console.log(`[Reminders] Running balance reminder check at ${new Date().toISOString()}`);

  try {
    // Find all invoices with an outstanding balance
    // FIX (task #20): populate bookingId so the reminder email shows the
    // readable "BK-..." string instead of a raw Mongo ObjectId — see the
    // matching FIX comment in emailService.js's sendBalanceReminderEmail.
    //
    // FIX (Tier 1.5, B.3 — critical): 'UNPAID' was missing from this list.
    // That's the exact status a Pay-After-Completion invoice is created
    // with (routes/booking.js's createCompletionInvoice) — so those
    // invoices were silently excluded from every reminder run, forever.
    // Combined with no immediate email at creation either (also fixed),
    // a customer who chose Pay-After-Completion previously had no path to
    // ever pay online.
    const invoices = await Invoice.find({
      status:        { $in: ['PARTIAL', 'SENT', 'UNPAID'] },
      balanceAmount: { $gt: 0 },
    }).populate('bookingId', 'bookingId');

    const now = new Date();
    let sent = 0;
    let skipped = 0;

    for (const invoice of invoices) {
      try {
        const reminderType = determineReminderType(invoice, now);
        if (!reminderType) { skipped++; continue; }

        const alreadySent = await hasAlreadySentReminder(invoice._id, reminderType);
        if (alreadySent) { skipped++; continue; }

        // Send the email
        await sendBalanceReminderEmail(invoice, reminderType);

        // Log it so we never send the same type twice for this invoice
        await PaymentReminder.create({
          invoiceId:     invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          customerId:    invoice.customer?.userId?.toString() || 'unknown',
          customerEmail: invoice.customer?.email || 'unknown',
          amount:        invoice.balanceAmount,
          dueDate:       getAssumedDueDate(invoice),
          reminderType,
          sentAt:        now,
          status:        'sent',
        });

        sent++;
      } catch (invoiceErr) {
        console.error(`[Reminders] Failed for invoice ${invoice.invoiceNumber}:`, invoiceErr.message);

        // Log the failure so we can retry or alert
        await PaymentReminder.create({
          invoiceId:     invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          customerId:    invoice.customer?.userId?.toString() || 'unknown',
          customerEmail: invoice.customer?.email || 'unknown',
          amount:        invoice.balanceAmount,
          dueDate:       getAssumedDueDate(invoice),
          reminderType:  'first',
          sentAt:        now,
          status:        'failed',
        }).catch(() => {});
      }
    }

    console.log(`[Reminders] Done — sent: ${sent}, skipped: ${skipped}, total invoices checked: ${invoices.length}`);
  } catch (err) {
    console.error('[Reminders] Fatal error during reminder check:', err.message);
  }
};

// Start the cron scheduler
// Runs every hour at minute 0  (e.g. 9:00, 10:00, 11:00...)
// Change to '*/30 * * * *' for every 30 minutes, or '0 9 * * *' for once daily at 9am
const startReminderScheduler = () => {
  console.log('[Reminders] Scheduler started — runs every hour');

  // Run immediately on startup (catches any overdue invoices right away)
  runReminderCheck();

  // Then run on schedule
  cron.schedule('0 * * * *', runReminderCheck);
};

module.exports = { startReminderScheduler, runReminderCheck };