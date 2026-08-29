const nodemailer = require('nodemailer');

// ── Logging helpers ───────────────────────────────────────────────────────────
const logEmailFailure = (context, recipient, error, metadata = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    context, recipient,
    error:     error.message || String(error),
    errorCode: error.code || 'UNKNOWN',
    ...metadata,
  };
  console.error('='.repeat(60));
  console.error('EMAIL FAILURE LOG');
  console.error('-'.repeat(60));
  console.error(JSON.stringify(logEntry, null, 2));
  console.error('='.repeat(60));
  return logEntry;
};

const logEmailSuccess = (context, recipient, metadata = {}) => {
  console.log(`[EMAIL SUCCESS] ${new Date().toISOString()} - ${context} - Sent to: ${recipient}`, metadata);
};

// ── Shared transporter (exported so email.js can reuse — no duplicate instance) ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Verify transporter unless in test environment where we don't want external network calls
if (process.env.NODE_ENV !== 'test') {
  transporter.verify((error) => {
    if (error) {
      logEmailFailure('transporter-verify', 'N/A', error, { success: false });
      console.log('HINT: Set GMAIL_USER and GMAIL_PASS in .env (use a Google App Password).');
    } else {
      console.log('Email transporter ready.');
    }
  });
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
// Gives every email a consistent branded look with a header, body, and footer.
const htmlWrapper = (title, bodyHtml, invoiceUrl = null) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 28px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 28px 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h2 { color: #111827; font-size: 18px; margin: 0 0 16px; }
    .detail-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 600; color: #111827; }
    .cta-btn { display: inline-block; margin: 20px 0 8px; padding: 12px 28px; background: #7c3aed; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .cta-btn:hover { background: #6d28d9; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 18px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    .badge-paid   { color: #065f46; background: #d1fae5; padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .badge-partial{ color: #92400e; background: #fef3c7; padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Cloud Laundry.lk</h1>
      <p>Professional Cleaning Services</p>
    </div>
    <div class="body">
      <h2>${title}</h2>
      ${bodyHtml}
      ${invoiceUrl ? `<p style="margin-top:20px"><a href="${invoiceUrl}" class="cta-btn">View Invoice</a></p><p style="font-size:13px;color:#6b7280">Or copy this link: <a href="${invoiceUrl}" style="color:#7c3aed">${invoiceUrl}</a></p>` : ''}
    </div>
    <div class="footer">
      Cloud Laundry.lk &bull; Colombo, Sri Lanka &bull; +94 11 234 5678 &bull; info@cloudlaundry.lk<br>
      This is a system-generated email. Please do not reply directly.
    </div>
  </div>
</body>
</html>`;

// ── 1. Payment confirmation ───────────────────────────────────────────────────
// FIX: Was called with (email, invoice) — 2 args. Signature is now (invoice) only.
// FIX: Added invoice link so customer can view/download their invoice.
const sendPaymentConfirmationEmail = async (invoice) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping payment confirmation');
    return;
  }

  const invoiceUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.bookingId}`;
  const isPartial  = invoice.status === 'PARTIAL';

  const body = `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>We have successfully received your payment. Here is your payment summary:</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice Number</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${invoice.bookingId}</span></div>
      <div class="detail-row"><span class="detail-label">Amount Paid</span><span class="detail-value">Rs. ${invoice.paidAmount.toLocaleString()}</span></div>
      ${isPartial ? `<div class="detail-row"><span class="detail-label">Balance Due</span><span class="detail-value" style="color:#92400e">Rs. ${invoice.balanceAmount.toLocaleString()}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="${isPartial ? 'badge-partial' : 'badge-paid'}">${isPartial ? 'ADVANCE PAID' : 'FULLY PAID'}</span></span></div>
    </div>
    ${isPartial ? `<p style="color:#92400e;font-size:14px">⚠️ The remaining balance of <strong>Rs. ${invoice.balanceAmount.toLocaleString()}</strong> will be collected after your service is completed.</p>` : ''}
    <p>You can view and download your full invoice using the button below:</p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      invoice.customer.email,
    subject: `Payment Confirmed — Invoice #${invoice.invoiceNumber} — Cloud Laundry.lk`,
    html:    htmlWrapper('Payment Confirmed!', body, invoiceUrl),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('payment-confirmation', invoice.customer.email, {
      invoiceNumber: invoice.invoiceNumber, bookingId: invoice.bookingId, amount: invoice.paidAmount,
    });
  } catch (error) {
    logEmailFailure('payment-confirmation', invoice.customer.email, error, {
      invoiceNumber: invoice.invoiceNumber, bookingId: invoice.bookingId,
    });
  }
};

// ── 2. Manual invoice send (by admin) ────────────────────────────────────────
// FIX: This function was missing from the original emailService.js entirely,
// causing the POST /api/invoices/:invoiceNumber/send-email route to crash.
const sendInvoiceEmail = async (toEmail, invoice) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping invoice email');
    return;
  }

  const invoiceUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.bookingId}`;

  const body = `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>Please find your invoice details below. You can view and download the full formatted invoice using the button below.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice Number</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${invoice.bookingId}</span></div>
      <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value">Rs. ${invoice.totalAmount.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Paid</span><span class="detail-value">Rs. ${invoice.paidAmount.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Balance</span><span class="detail-value">Rs. ${invoice.balanceAmount.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${invoice.status}</span></div>
    </div>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      toEmail,
    subject: `Invoice #${invoice.invoiceNumber} — Cloud Laundry.lk`,
    html:    htmlWrapper(`Invoice #${invoice.invoiceNumber}`, body, invoiceUrl),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('invoice-email', toEmail, { invoiceNumber: invoice.invoiceNumber });
  } catch (error) {
    logEmailFailure('invoice-email', toEmail, error, { invoiceNumber: invoice.invoiceNumber });
  }
};

// ── 3. Refund request notification (to admin) ─────────────────────────────────
const sendRefundRequestEmail = async (invoice, reason) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping refund request');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  const body = `
    <p>A refund has been requested for the following invoice:</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${invoice.customer.name} (${invoice.customer.email})</span></div>
      <div class="detail-row"><span class="detail-label">Amount Paid</span><span class="detail-value">Rs. ${invoice.paidAmount.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${reason}</span></div>
    </div>
    <p>Please review this request in the admin dashboard.</p>`;

  const mailOptions = {
    from:    `"System Notification" <${process.env.GMAIL_USER}>`,
    to:      adminEmail,
    subject: `Refund Request — Invoice #${invoice.invoiceNumber}`,
    html:    htmlWrapper('New Refund Request', body),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('refund-request', adminEmail, { invoiceNumber: invoice.invoiceNumber, reason });
  } catch (error) {
    logEmailFailure('refund-request', adminEmail, error, { invoiceNumber: invoice.invoiceNumber });
  }
};

// ── 4. Refund / price reduction status email ──────────────────────────────────
// FIX: Added refundAmount as 4th param. Previously the email was sent after
// invoice.paidAmount was already decremented, so it showed Rs. 0 on full refunds.
const sendRefundStatusEmail = async (invoice, status, rejectionReason = '', refundAmount = null) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping refund status email');
    return;
  }

  const invoiceUrl   = `${process.env.FRONTEND_URL}/invoice/${invoice.bookingId}`;
  const displayAmount = refundAmount !== null
    ? refundAmount.toLocaleString()
    : invoice.paidAmount.toLocaleString();

  const isApproved = status === 'approved';
  const subject = isApproved
    ? `Refund Approved — Rs. ${displayAmount} — Cloud Laundry.lk`
    : `Refund Request Update — Invoice #${invoice.invoiceNumber}`;

  const body = isApproved ? `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>Your refund request has been approved.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Refund Amount</span><span class="detail-value" style="color:#065f46">Rs. ${displayAmount}</span></div>
      <div class="detail-row"><span class="detail-label">Timeline</span><span class="detail-value">5–7 business days</span></div>
    </div>
    <p>The refund will be credited to your original payment method within 5–7 business days.</p>` : `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>We're sorry, but your refund request for invoice <strong>#${invoice.invoiceNumber}</strong> could not be approved.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${rejectionReason}</span></div>
    </div>
    <p>If you have questions, please contact our support team at info@cloudlaundry.lk or +94 11 234 5678.</p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      invoice.customer.email,
    subject,
    html:    htmlWrapper(isApproved ? 'Refund Approved' : 'Refund Request Update', body, isApproved ? invoiceUrl : null),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('refund-status', invoice.customer.email, {
      invoiceNumber: invoice.invoiceNumber, status, refundAmount: displayAmount,
    });
  } catch (error) {
    logEmailFailure('refund-status', invoice.customer.email, error, {
      invoiceNumber: invoice.invoiceNumber, status,
    });
  }
};

// ── 4b. Price-reduction refund — request the customer's bank details ─────────
// NEW — replaces the old flow where the admin manually typed the customer's
// bank details into a browser prompt() (gathered by phone/email beforehand).
// Now: approving a cash-paid price reduction sends this email instead, with
// a link to a self-service form where the customer enters their own bank
// details. See submitBankDetails/completeRefund in
// controllers/priceReductionController.js.
const sendBankDetailsRequestEmail = async (invoice, reduction) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping bank-details-request email');
    return;
  }

  const formUrl = `${process.env.FRONTEND_URL}/refund-bank-details/${reduction._id}`;
  const amount  = (reduction.approvedAmount || 0).toLocaleString();

  const body = `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>Good news — your price reduction request has been approved.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Approved Refund</span><span class="detail-value" style="color:#065f46">Rs. ${amount}</span></div>
    </div>
    <p>Since this invoice was paid in cash, we don't have an online gateway to send the refund through automatically. You can choose to have it sent via bank transfer, or come collect it in person at our office — please click below to let us know which you'd prefer:</p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      invoice.customer.email,
    // FIX (Tier 4.1, audit finding "In-person cash pickup option —
    // missing"): subject/copy no longer assume bank transfer is the only
    // option — the linked page now lets the customer choose between bank
    // transfer and in-person pickup.
    subject: `Action Needed — Choose How to Receive Your Rs. ${amount} Refund — Cloud Laundry.lk`,
    html:    htmlWrapper('Refund Method Needed', body, formUrl),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('bank-details-request', invoice.customer.email, {
      invoiceNumber: invoice.invoiceNumber, reductionId: reduction._id?.toString(),
    });
  } catch (error) {
    logEmailFailure('bank-details-request', invoice.customer.email, error, {
      invoiceNumber: invoice.invoiceNumber,
    });
  }
};

// ── 5. Balance payment reminder ───────────────────────────────────────────────
// Used by the server-side cron scheduler (reminderScheduler.js).
const sendBalanceReminderEmail = async (invoice, reminderType = 'first') => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping balance reminder');
    return;
  }

  // FIX (task #20): was `?bookingId=${invoice.bookingId}` — invoice.bookingId
  // is an ObjectId ref (unless the caller populated it), so this used to
  // embed a raw Mongo ObjectId in the link. Also neither BalancePaymentPage
  // nor any backend route actually read a `bookingId` query param at all —
  // this reminder email's link never worked. Standardized on `invoiceId`
  // (the Invoice's own _id), which is what the new balance-payment routes
  // (routes/payhere.js: balance-info / generate-balance-hash) expect, and
  // matches invoiceController.generatePaymentLink's link format too.
  const invoiceUrl = `${process.env.FRONTEND_URL}/balance-payment?invoiceId=${invoice._id}`;

  // Prefer the populated readable "BK-..." string; fall back to the raw
  // value only if the caller didn't populate it.
  const readableBookingId = invoice.bookingId?.bookingId || invoice.bookingId;

  const urgencyLabel = {
    first:   'Friendly Reminder',
    second:  'Second Reminder',
    final:   'Final Reminder',
    overdue: 'Overdue Notice',
  }[reminderType] || 'Payment Reminder';

  const urgencyColour = reminderType === 'overdue' ? '#dc2626' : reminderType === 'final' ? '#d97706' : '#7c3aed';

  const body = `
    <p>Hello <strong>${invoice.customer.name}</strong>,</p>
    <p>This is a <strong style="color:${urgencyColour}">${urgencyLabel}</strong> for an outstanding balance on your invoice.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">${invoice.invoiceNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${readableBookingId}</span></div>
      <div class="detail-row"><span class="detail-label">Balance Due</span><span class="detail-value" style="color:${urgencyColour}">Rs. ${invoice.balanceAmount.toLocaleString()}</span></div>
    </div>
    <p>Please click the button below to complete your payment:</p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      invoice.customer.email,
    subject: `${urgencyLabel}: Balance of Rs. ${invoice.balanceAmount.toLocaleString()} Due — Cloud Laundry.lk`,
    html:    htmlWrapper(`Payment ${urgencyLabel}`, body, invoiceUrl),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess(`balance-reminder-${reminderType}`, invoice.customer.email, {
      invoiceNumber: invoice.invoiceNumber, balance: invoice.balanceAmount,
    });
  } catch (error) {
    logEmailFailure(`balance-reminder-${reminderType}`, invoice.customer.email, error, {
      invoiceNumber: invoice.invoiceNumber,
    });
  }
};

// ── 6. Pre-cleaning reminder (task #22, C.4) ──────────────────────────────────
// Used by the server-side cron scheduler (serviceReminderScheduler.js).
// Reminds the customer their booking is coming up.
const sendPreCleaningReminderEmail = async (booking) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping pre-cleaning reminder');
    return;
  }
  if (!booking.customerEmail) {
    console.warn(`[EMAIL] Booking ${booking.bookingId} has no customer email — skipping pre-cleaning reminder`);
    return;
  }

  const body = `
    <p>Hello <strong>${booking.customerName || 'Customer'}</strong>,</p>
    <p>Just a reminder that your <strong>${booking.serviceName || booking.serviceType || 'cleaning'}</strong> service is coming up soon.</p>
    <div class="detail-box">
      <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${booking.bookingId}</span></div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${booking.date || 'N/A'}</span></div>
      <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${booking.time || 'N/A'}</span></div>
      <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${booking.address || 'N/A'}</span></div>
    </div>
    <p>Please make sure someone is available at the address above to let our team in. If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      booking.customerEmail,
    subject: `Reminder: Your Cleaning Service is Coming Up — Cloud Laundry.lk`,
    html:    htmlWrapper('Upcoming Service Reminder', body),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('pre-cleaning-reminder', booking.customerEmail, { bookingId: booking.bookingId });
  } catch (error) {
    logEmailFailure('pre-cleaning-reminder', booking.customerEmail, error, { bookingId: booking.bookingId });
  }
};

// ── 7. Post-completion feedback nudge (task #22, C.6) ─────────────────────────
// Used by the server-side cron scheduler (serviceReminderScheduler.js).
// Sent ~3 days after a job completes if the customer hasn't left feedback yet.
const sendFeedbackNudgeEmail = async (booking) => {
  if (!process.env.GMAIL_USER) {
    console.warn('[EMAIL] Not configured — skipping feedback nudge');
    return;
  }
  if (!booking.customerEmail) {
    console.warn(`[EMAIL] Booking ${booking.bookingId} has no customer email — skipping feedback nudge`);
    return;
  }

  const feedbackUrl = `${process.env.FRONTEND_URL}/feedback`;

  const body = `
    <p>Hello <strong>${booking.customerName || 'Customer'}</strong>,</p>
    <p>We hope you were happy with your recent <strong>${booking.serviceName || booking.serviceType || 'cleaning'}</strong> service (Booking ${booking.bookingId}).</p>
    <p>We'd love to hear how it went — your feedback helps us keep improving, and it only takes a minute.</p>
    <p style="margin-top:20px"><a href="${feedbackUrl}" class="cta-btn">Leave Feedback</a></p>
    <p style="font-size:13px;color:#6b7280">Or copy this link: <a href="${feedbackUrl}" style="color:#7c3aed">${feedbackUrl}</a></p>`;

  const mailOptions = {
    from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
    to:      booking.customerEmail,
    subject: `How Was Your Service? — Cloud Laundry.lk`,
    html:    htmlWrapper('How Did We Do?', body),
  };

  try {
    await transporter.sendMail(mailOptions);
    logEmailSuccess('feedback-nudge', booking.customerEmail, { bookingId: booking.bookingId });
  } catch (error) {
    logEmailFailure('feedback-nudge', booking.customerEmail, error, { bookingId: booking.bookingId });
  }
};

module.exports = {
  transporter,                    // shared — imported by email.js to avoid duplicate instance
  sendPaymentConfirmationEmail,
  sendInvoiceEmail,
  sendRefundRequestEmail,
  sendRefundStatusEmail,
  sendBankDetailsRequestEmail,
  sendBalanceReminderEmail,
  sendPreCleaningReminderEmail,
  sendFeedbackNudgeEmail,
};