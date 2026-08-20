const sendEmail = require('../utils/sendEmail');

// Mirrors the TEMPLATES array in frontend/src/components/EmailTemplates.tsx —
// keep the subject/body text in sync with that file when templates change.
const TEMPLATES = {
  'booking-confirmed': {
    subject: 'Your Booking is Confirmed! — Cloud Laundry.lk',
    body: `Dear {{customer_name}},

Thank you for choosing Cloud Laundry.lk! Your booking has been confirmed.

BOOKING DETAILS
Booking ID     : {{booking_id}}
Service        : {{service_name}}
Date & Time    : {{service_date}} at {{service_time}}
Address        : {{address}}

PAYMENT SUMMARY
Amount Paid    : Rs. {{paid_amount}}
Balance Due    : Rs. {{balance_amount}}
Payment Method : {{payment_method}}

Our team will arrive at your location at the scheduled time.

If you have any questions, call us at +94 11 234 5678.

Warm regards,
Cloud Laundry.lk Team`,
  },
  'payment-received': {
    subject: 'Payment Received — Invoice #{{invoice_number}}',
    body: `Dear {{customer_name}},

We have received your payment. Thank you!

INVOICE SUMMARY
Invoice No.    : {{invoice_number}}
Booking ID     : {{booking_id}}
Service        : {{service_name}}
Amount Paid    : Rs. {{paid_amount}}
Payment Method : {{payment_method}}
Date           : {{payment_date}}

Thank you for trusting Cloud Laundry.lk!

Best regards,
Cloud Laundry.lk Billing Team`,
  },
  'service-reminder': {
    subject: 'Reminder: Your Service is Tomorrow — Cloud Laundry.lk',
    body: `Dear {{customer_name}},

Your cleaning service is scheduled for tomorrow!

SERVICE DETAILS
Service        : {{service_name}}
Date           : {{service_date}}
Time           : {{service_time}}
Address        : {{address}}
Booking ID     : {{booking_id}}

Need to reschedule? Call us at least 4 hours before: +94 11 234 5678.

See you tomorrow!
Cloud Laundry.lk Team`,
  },
  'balance-due': {
    subject: 'Balance Payment Due — Cloud Laundry.lk',
    body: `Dear {{customer_name}},

Your service is complete. The remaining balance is now due.

BALANCE DETAILS
Booking ID     : {{booking_id}}
Service        : {{service_name}}
Balance Due    : Rs. {{balance_amount}}
Advance Paid   : Rs. {{paid_amount}}

Please pay your balance at: {{payment_link}}

Cloud Laundry.lk Team`,
  },
  'refund-initiated': {
    subject: 'Refund Initiated — Rs. {{refund_amount}} — Cloud Laundry.lk',
    body: `Dear {{customer_name}},

Your refund has been processed successfully.

REFUND DETAILS
Refund Amount  : Rs. {{refund_amount}}
Booking ID     : {{booking_id}}
Reason         : {{refund_reason}}
Reference No.  : {{refund_reference}}

Your refund will appear in your account within 5-7 business days.

Cloud Laundry.lk Support Team
+94 11 234 5678`,
  },
  'promotion': {
    subject: 'Special Offer Just for You — {{discount}}% Off!',
    body: `Dear {{customer_name}},

We have an exclusive offer just for you!

{{discount}}% OFF on all {{service_category}} services
Valid: {{promo_start}} to {{promo_end}}
Code: {{promo_code}}

Book now at cloudlaundry.lk or call +94 11 234 5678.

Cloud Laundry.lk Team`,
  },
  're-clean-reminder': {
    subject: 'Time for a Re-Clean? — Cloud Laundry.lk',
    body: `Dear {{customer_name}},

It has been {{days_since}} days since your last {{service_name}}.

Most customers schedule a re-clean every 30 days.

Book now and use code RE-CLEAN10 for 10% off.

cloudlaundry.lk | +94 11 234 5678

Cloud Laundry.lk Team`,
  },
};

const fillVariables = (text, values = {}) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] ?? `{{${key}}}`));

// ─── POST /api/email/send ──────────────────────────────────────────────────────
// Body: { templateId, to, variables }
const send = async (req, res) => {
  try {
    const { templateId, to, variables } = req.body;
    const template = TEMPLATES[templateId];
    if (!template) return res.status(400).json({ message: 'Unknown email template.' });
    if (!to) return res.status(400).json({ message: 'Recipient email is required.' });

    const subject = fillVariables(template.subject, variables);
    const bodyText = fillVariables(template.body, variables);
    const html = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${bodyText}</pre>`;

    const sent = await sendEmail({ to, subject, html });
    if (!sent) return res.status(502).json({ message: 'Email provider failed to send the message.' });

    res.json({ success: true });
  } catch (err) {
    console.error('email send error:', err);
    res.status(500).json({ message: 'Failed to send email.' });
  }
};

module.exports = { send, TEMPLATES };
