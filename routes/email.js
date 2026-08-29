const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

// FIX: Import the shared transporter from emailService instead of creating a
// second one. Previously email.js and emailService.js both created their own
// nodemailer.createTransport() with the same Gmail credentials — doubling
// connection overhead and requiring credential changes in two places.
const { transporter } = require('../utils/emailService');

// ── Helper: fill {{variable}} placeholders ────────────────────────────────
const fillTemplate = (template, variables) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
};

// ── Email Templates ───────────────────────────────────────────────────────
const TEMPLATES = {

  'booking-confirmed': {
    subject: 'Your Booking is Confirmed! — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Thank you for choosing Cloud Laundry.lk! Your booking has been confirmed.

BOOKING DETAILS
───────────────────────────────
Booking ID     : ${v.booking_id}
Service        : ${v.service_name}
Date & Time    : ${v.service_date} at ${v.service_time}
Address        : ${v.address}
───────────────────────────────

PAYMENT SUMMARY
Amount Paid    : Rs. ${v.paid_amount}
Balance Due    : Rs. ${v.balance_amount}
Payment Method : ${v.payment_method}

Our team will arrive at your location at the scheduled time.

If you have any questions, call us at +94 11 234 5678.

Warm regards,
Cloud Laundry.lk Team
    `.trim(),
  },

  'payment-received': {
    subject: `Payment Received — Invoice #${'{invoice_number}'} — Cloud Laundry.lk`,
    body: (v) => `
Dear ${v.customer_name},

We have received your payment. Thank you!

INVOICE SUMMARY
───────────────────────────────
Invoice No.    : ${v.invoice_number}
Booking ID     : ${v.booking_id}
Service        : ${v.service_name}
Amount Paid    : Rs. ${v.paid_amount}
Payment Method : ${v.payment_method}
Date           : ${v.payment_date}
${v.balance_amount > 0 ? `\nBalance Remaining: Rs. ${v.balance_amount}\nThe remaining balance will be collected after your service.` : ''}
───────────────────────────────

Thank you for trusting Cloud Laundry.lk!

Best regards,
Cloud Laundry.lk Billing Team
    `.trim(),
  },

  'service-reminder': {
    subject: 'Reminder: Your Service is Tomorrow — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

This is a friendly reminder that your cleaning service is scheduled for tomorrow!

SERVICE DETAILS
───────────────────────────────
Service        : ${v.service_name}
Date           : ${v.service_date}
Time           : ${v.service_time}
Booking ID     : ${v.booking_id}
───────────────────────────────

PREPARATION CHECKLIST
- Ensure someone is home at the scheduled time
- Clear access to the area to be cleaned
- Have your Booking ID ready for reference

Need to reschedule? Call us at +94 11 234 5678 at least 4 hours before.

See you tomorrow!
Cloud Laundry.lk Team
    `.trim(),
  },

  'payment-link': {
    subject: 'Payment Link — Your Service is Complete — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your ${v.service_name} service has been completed successfully!

Please make your final payment using the link below:

Payment Link: ${v.payment_link}

PAYMENT DETAILS
Amount Due     : Rs. ${v.amount}
Booking ID     : ${v.booking_id}
Due By         : ${v.due_date}

This link is valid for 24 hours.

Thank you for choosing Cloud Laundry.lk!

Best regards,
Cloud Laundry.lk Team
    `.trim(),
  },

  'balance-due': {
    subject: 'Balance Payment Due — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your service has been completed. The remaining balance is now due.

BALANCE DETAILS
───────────────────────────────
Booking ID     : ${v.booking_id}
Service        : ${v.service_name}
Balance Due    : Rs. ${v.balance_amount}
Advance Paid   : Rs. ${v.paid_amount}
───────────────────────────────

Please pay your balance at: ${v.payment_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'refund-initiated': {
    subject: 'Refund Initiated — Rs. {{refund_amount}} — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your refund request has been processed successfully.

REFUND DETAILS
───────────────────────────────
Refund Amount  : Rs. ${v.refund_amount}
Booking ID     : ${v.booking_id}
Reason         : ${v.refund_reason}
Reference No.  : ${v.refund_reference}
───────────────────────────────

${v.is_online === 'true'
  ? 'Your refund will appear in your account within 5-7 business days.'
  : 'Please visit our office to collect your cash refund.\n   Office Hours: Mon-Sat, 9:00 AM - 5:00 PM'}

Cloud Laundry.lk Support Team
+94 11 234 5678
    `.trim(),
  },

  'payment-failed': {
    subject: 'Payment Failed — Please Try Again — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Unfortunately, your recent payment attempt failed.

DETAILS
───────────────────────────────
Booking ID     : ${v.booking_id}
Amount         : Rs. ${v.amount}
Reason         : ${v.failure_reason || 'Payment was declined by the provider.'}
───────────────────────────────

Please try the payment again: ${v.retry_link}

If you continue to have issues, please contact our support team at +94 11 234 5678.

Best regards,
Cloud Laundry.lk Team
    `.trim(),
  },

  'tracking-update': {
    subject: 'Order Update: {{status}} — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your booking status has been updated.

TRACKING UPDATE
───────────────────────────────
Booking ID     : ${v.booking_id}
Service        : ${v.service_name}
New Status     : ${v.status}
Details        : ${v.status_detail}
───────────────────────────────

Track your order anytime at: ${v.tracking_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'worker-arrival': {
    subject: 'Your Cleaner Has Arrived — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your assigned cleaner has reached the location.

ARRIVAL DETAILS
───────────────────────────────
Booking ID     : ${v.booking_id}
Service        : ${v.service_name}
Cleaner        : ${v.worker_name}
Location       : ${v.address}
ETA            : ${v.eta || 'Now'}
───────────────────────────────

Please ensure access to the area to be cleaned.

Cloud Laundry.lk Team
    `.trim(),
  },

  'service-complete': {
    subject: 'Service Complete — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your ${v.service_name} service has been completed successfully.

COMPLETION SUMMARY
───────────────────────────────
Booking ID     : ${v.booking_id}
Completed At   : ${v.completed_at}
Cleaner        : ${v.worker_name}
───────────────────────────────

${v.balance_amount && String(v.balance_amount) !== '0'
  ? `A balance of Rs. ${v.balance_amount} is still due: ${v.payment_link}`
  : 'Thank you for choosing Cloud Laundry.lk!'}

We would love your feedback: ${v.rating_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'service-renewal': {
    subject: 'Time to Renew Your Cleaning Plan — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your ${v.plan_name} plan is due for renewal.

RENEWAL DETAILS
───────────────────────────────
Plan           : ${v.plan_name}
Renewal Date   : ${v.renewal_date}
Amount         : Rs. ${v.amount}
───────────────────────────────

Renew now: ${v.renewal_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'subscription-expiry': {
    subject: 'Your Subscription Expires Soon — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Your ${v.plan_name} subscription expires on ${v.expiry_date}.

Renew to keep your discount and scheduled slots.

Renew: ${v.renewal_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'promotion': {
    subject: 'Special Offer Just for You — {{discount}}% Off!',
    body: (v) => `
Dear ${v.customer_name},

We have an exclusive offer just for you!

${v.discount}% OFF on all ${v.service_category} services
Valid: ${v.promo_start} to ${v.promo_end}
Code: ${v.promo_code}

Book now at cloudlaundry.lk or call +94 11 234 5678.

Cloud Laundry.lk Team
    `.trim(),
  },

  'new-package': {
    subject: 'New Cleaning Package: {{package_name}} — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

We just launched a new package you may like.

${v.package_name}
${v.package_detail}
Starting from Rs. ${v.price}

Book: ${v.booking_link}

Cloud Laundry.lk Team
    `.trim(),
  },

  'loyalty-rewards': {
    subject: 'Loyalty Reward Unlocked — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

Congratulations! You earned a loyalty reward.

Points added  : ${v.points}
Current badge : ${v.badge}
Reward        : ${v.reward}

Use code ${v.promo_code} at checkout.

Cloud Laundry.lk Team
    `.trim(),
  },

  're-clean-reminder': {
    subject: 'Time for a Re-Clean? — Cloud Laundry.lk',
    body: (v) => `
Dear ${v.customer_name},

It has been ${v.days_since} days since your last ${v.service_name}.

Most customers schedule a re-clean every 30 days.

Book now and use code ${v.promo_code || 'RE-CLEAN10'} for 10% off.

cloudlaundry.lk | +94 11 234 5678

Cloud Laundry.lk Team
    `.trim(),
  },
};

// ── @route  GET /api/email/templates ──────────────────────────────────────
// @desc    List all available email templates with their required variables
// @access  Private (admin only)
//
// FIX 1: Added auth middleware — template metadata should not be public.
// FIX 2: Removed the duplicate GET /templates definition that was registered
//         after module.exports (dead code). There is now exactly one definition.
router.get('/templates', auth, (req, res) => {
  try {
    const templateList = Object.keys(TEMPLATES).map(id => {
      const template = TEMPLATES[id];
      const bodyString = template.body.toString();
      const variables = [...bodyString.matchAll(/v\.(\w+)/g)].map(match => match[1]);
      const uniqueVariables = [...new Set(variables)];

      return {
        id,
        subject: typeof template.subject === 'function' ? template.subject({}) : template.subject,
        variables: uniqueVariables,
      };
    });
    res.status(200).json(templateList);
  } catch (error) {
    console.error('Error fetching templates:', error.message);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
});

// ── @route  POST /api/email/send ──────────────────────────────────────────
// @desc    Send a specific email template to a customer
// @access  Private (admin only)
//
// FIX: Added auth middleware. Previously this was fully public — anyone could
// trigger emails to any address using any template, turning the server into
// an open relay for phishing or spam using the business's domain.
router.post('/send', auth, async (req, res) => {
  try {
    const { templateId, to, variables } = req.body;

    if (!templateId || !to) {
      return res.status(400).json({ message: 'templateId and to (email) are required' });
    }

    const template = TEMPLATES[templateId];
    if (!template) {
      return res.status(404).json({ message: `Template '${templateId}' not found` });
    }

    const subject = typeof template.subject === 'function'
      ? template.subject(variables)
      : fillTemplate(template.subject, variables || {});

    const text = template.body(variables || {});

    await transporter.sendMail({
      from: `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });

    console.log(`Email sent: ${templateId} → ${to}`);
    res.status(200).json({ message: 'Email sent successfully', templateId, to });

  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ message: 'Failed to send email' });
  }
});

// ── @route  POST /api/email/payment-link ─────────────────────────────────
// @desc    Send payment link after service completion
// @access  Private (staff/admin)
router.post('/payment-link', auth, async (req, res) => {
  try {
    const { to, customerName, bookingId, serviceType, amount, dueDate } = req.body;

    if (!to || !bookingId || !amount) {
      return res.status(400).json({ message: 'to, bookingId and amount are required' });
    }

    const paymentLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-link?bookingId=${bookingId}&amount=${amount}`;

    const variables = {
      customer_name: customerName || 'Customer',
      service_name:  serviceType || 'Cleaning Service',
      booking_id:    bookingId,
      amount:        Number(amount).toLocaleString(),
      payment_link:  paymentLink,
      due_date:      dueDate || 'Within 24 hours',
    };

    await transporter.sendMail({
      from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Payment Link — Your Service is Complete — Cloud Laundry.lk',
      text:    TEMPLATES['payment-link'].body(variables),
    });

    console.log(`Payment link email sent to ${to} for booking ${bookingId}`);
    res.status(200).json({ message: 'Payment link email sent', paymentLink });

  } catch (error) {
    console.error('Error sending payment link email:', error.message);
    res.status(500).json({ message: 'Failed to send payment link' });
  }
});

// ── @route  POST /api/email/balance-reminder ──────────────────────────────
// @desc    Send balance payment reminder (advance+balance flow)
// @access  Private (staff/admin)
//
// FIX: This route was previously defined AFTER module.exports = router midway
// through the file, so Express never registered it (always returned 404).
// Moved here before the single module.exports at the end of the file.
router.post('/balance-reminder', auth, async (req, res) => {
  try {
    const { to, customerName, bookingId, serviceType, balanceAmount, paidAmount } = req.body;

    if (!to || !bookingId || !balanceAmount) {
      return res.status(400).json({ message: 'to, bookingId and balanceAmount are required' });
    }

    const paymentLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/balance-payment?bookingId=${bookingId}&balance=${balanceAmount}`;

    const variables = {
      customer_name:  customerName || 'Customer',
      service_name:   serviceType || 'Cleaning Service',
      booking_id:     bookingId,
      balance_amount: Number(balanceAmount).toLocaleString(),
      paid_amount:    Number(paidAmount).toLocaleString(),
      payment_link:   paymentLink,
    };

    await transporter.sendMail({
      from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Balance Payment Due — Cloud Laundry.lk',
      text:    TEMPLATES['balance-due'].body(variables),
    });

    res.status(200).json({ message: 'Balance reminder email sent', paymentLink });

  } catch (error) {
    console.error('Error sending balance reminder:', error.message);
    res.status(500).json({ message: 'Failed to send balance reminder' });
  }
});

// FIX: Single module.exports at the very end — no more premature export
// midway through the file that made subsequent routes unreachable.
router.TEMPLATES = TEMPLATES;
module.exports = router;