const cron = require('node-cron');
const Invoice = require('../models/Invoice');
const PaymentReminder = require('../models/PaymentReminder');
const sendEmail = require('./sendEmail');
const { TEMPLATES } = require('../controllers/emailController');

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
  const msLeft   = dueDate - now;
  const daysLeft  = msLeft / (1000 * 60 * 60 * 24);
  const hoursLeft = msLeft / (1000 * 60 * 60);

  if (hoursLeft < -CONFIG.overdueReminderHours) return 'overdue';
  if (daysLeft <= CONFIG.finalReminderDays  && daysLeft > 0)                        return 'final';
  if (daysLeft <= CONFIG.secondReminderDays && daysLeft > CONFIG.finalReminderDays)  return 'second';
  if (daysLeft <= CONFIG.firstReminderDays  && daysLeft > CONFIG.secondReminderDays) return 'first';
  return null;
};

const hasAlreadySentReminder = async (invoiceId, reminderType) =>
  !!(await PaymentReminder.findOne({ invoiceId, reminderType }));

// Reuses the existing 'balance-due' template (controllers/emailController.js)
// and generic sendEmail util — no separate email system introduced.
const fillVariables = (text, values = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);

const sendBalanceReminderEmail = async (invoice, reminderType) => {
  const template = TEMPLATES['balance-due'];
  const vars = {
    customer_name:   invoice.customer?.name || 'Customer',
    booking_id:       invoice.bookingId || '',
    service_name:     invoice.serviceItems?.[0]?.name || 'your service',
    balance_amount:   (invoice.balanceAmount || 0).toLocaleString(),
    paid_amount:      (invoice.paidAmount || 0).toLocaleString(),
    payment_link:     `${process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000'}/#/billing/balance-payment?invoiceNumber=${invoice.invoiceNumber}`,
  };
  const subject = `[${reminderType.toUpperCase()} REMINDER] ${fillVariables(template.subject, vars)}`;
  const html    = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${fillVariables(template.body, vars)}</pre>`;

  if (!invoice.customer?.email) throw new Error('Invoice has no customer email on file');
  const sent = await sendEmail({ to: invoice.customer.email, subject, html });
  if (!sent) throw new Error('Email provider failed to send the reminder');
};

// Core logic — run once per hour
const runReminderCheck = async () => {
  console.log(`[Reminders] Running balance reminder check at ${new Date().toISOString()}`);

  try {
    const invoices = await Invoice.find({
      status:        { $in: ['PARTIAL', 'SENT'] },
      balanceAmount: { $gt: 0 },
    });

    const now = new Date();
    let sent = 0, skipped = 0;

    for (const invoice of invoices) {
      try {
        const reminderType = determineReminderType(invoice, now);
        if (!reminderType) { skipped++; continue; }

        if (await hasAlreadySentReminder(invoice._id, reminderType)) { skipped++; continue; }

        await sendBalanceReminderEmail(invoice, reminderType);

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

// Runs every hour at minute 0. Change to '*/30 * * * *' for every 30 minutes.
const startReminderScheduler = () => {
  console.log('[Reminders] Scheduler started — runs every hour');
  runReminderCheck(); // catch anything overdue right away on startup
  cron.schedule('0 * * * *', runReminderCheck);
};

module.exports = { startReminderScheduler, runReminderCheck };
