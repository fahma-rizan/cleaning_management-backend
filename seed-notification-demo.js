#!/usr/bin/env node
/**
 * Seed demo data for the full notification workflow (in-app + email).
 *
 * Usage:
 *   cd backend
 *   node seed-notification-demo.js
 *   node seed-notification-demo.js --in-app-only
 *   node seed-notification-demo.js --emails-only
 *   node seed-notification-demo.js --cleanup
 *
 * After seeding:
 *   1. Open http://localhost:3000/admin/financial-dashboard
 *   2. Click the bell — customer + admin notifications
 *   3. Open http://localhost:3000/email-templates — send/copy templates
 *   4. Check Gmail (GMAIL_USER) unless --in-app-only
 */
require('dotenv').config();

const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const NotificationTemplate = require('./models/NotificationTemplate');

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const TO_EMAIL = process.env.TEST_EMAIL || process.env.GMAIL_USER;
const ADMIN_USER = 'admin-001';
const CUSTOMER_USER = 'user-001';
const BOOKING_ID = 'BK-2026-DEMO-001';

const IN_APP_ONLY = process.argv.includes('--in-app-only');
const EMAILS_ONLY = process.argv.includes('--emails-only');
const CLEANUP = process.argv.includes('--cleanup');

const fillTemplate = (template, variables) =>
  String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);

const customerNotifs = [
  {
    type: 'order-confirmed',
    title: 'Booking Confirmed',
    message: `Your Deep Cleaning is confirmed for 25 Aug 2026 at 10:00 AM. Booking ${BOOKING_ID}.`,
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(6),
  },
  {
    type: 'payment',
    title: 'Advance Payment Received',
    message: 'We received Rs. 5,000 (PayHere). Balance Rs. 7,500 is due after service.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(5.8),
  },
  {
    type: 'tracking-update',
    title: 'Cleaner Assigned',
    message: 'Nimal Perera has been assigned to your booking. Status: Confirmed → Assigned.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(4),
  },
  {
    type: 'tracking-update',
    title: 'Cleaner En Route',
    message: 'Your cleaner is on the way to 42 Galle Road, Colombo 03. ETA 15 minutes.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(2),
  },
  {
    type: 'worker-arrival',
    title: 'Cleaner Has Arrived',
    message: 'Nimal Perera has reached your location. Please provide access to the area.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(1.5),
  },
  {
    type: 'tracking-update',
    title: 'Service In Progress',
    message: 'Deep Cleaning is now in progress at your location.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(1.2),
  },
  {
    type: 'tracking-update',
    title: 'Service Complete',
    message: 'Your Deep Cleaning job is complete. Please review and settle any balance.',
    actionUrl: `/job-complete/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(0.5),
  },
  {
    type: 'reminder',
    title: 'Pre-Cleaning Reminder',
    message: 'Your service is tomorrow at 10:00 AM. Please keep the area accessible.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(26),
  },
  {
    type: 'reminder',
    title: 'Payment Due',
    message: 'Balance of Rs. 7,500 is due for booking ' + BOOKING_ID + '.',
    actionUrl: `/balance-payment?bookingId=${BOOKING_ID}&balance=7500`,
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(0.4),
  },
  {
    type: 'reminder',
    title: 'Service Renewal',
    message: 'Your Monthly Home Cleaning plan renews on 1 Sep 2026 (Rs. 12,500).',
    actionUrl: '/email-templates',
    read: false,
    createdAt: hoursAgo(8),
  },
  {
    type: 'reminder',
    title: 'Subscription Expiring',
    message: 'Your Gold subscription expires on 5 Sep 2026. Renew to keep your 15% discount.',
    actionUrl: '/email-templates',
    read: false,
    createdAt: hoursAgo(10),
  },
  {
    type: 'promotion',
    title: 'Avurudu Festive Offer',
    message: '20% off all home cleaning this week. Use code AVURUDU20 until 31 Aug.',
    actionUrl: '/email-templates',
    read: false,
    createdAt: hoursAgo(12),
  },
  {
    type: 'promotion',
    title: 'New Package: Sofa + Carpet Combo',
    message: 'New combo package from Rs. 9,900. Ideal after your last Deep Cleaning.',
    actionUrl: '/email-templates',
    read: true,
    createdAt: hoursAgo(30),
  },
  {
    type: 'loyalty-points',
    title: 'Loyalty Reward Unlocked',
    message: 'You earned 120 points. Gold badge unlocked — use LOYAL10 for 10% off.',
    actionUrl: '/email-templates',
    read: false,
    createdAt: hoursAgo(5),
  },
  {
    type: 'recommendation',
    title: 'Time for a Re-Clean?',
    message: 'It has been 32 days since your last Deep Cleaning. Book again with RE-CLEAN10.',
    actionUrl: '/email-templates',
    read: false,
    createdAt: hoursAgo(3),
  },
  {
    type: 'rating-request',
    title: 'How was your service?',
    message: 'Please rate your Deep Cleaning with Nimal Perera.',
    actionUrl: `/invoice/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(0.3),
  },
  {
    type: 'payment-failed',
    title: 'Payment Failed',
    message: 'Card was declined for Rs. 12,500. Please retry payment for ' + BOOKING_ID + '.',
    actionUrl: `/payment/${BOOKING_ID}`,
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(48),
  },
];

const adminNotifs = [
  {
    type: 'order-confirmed',
    title: 'New Booking Received',
    message: `Kavya Perera booked Deep Cleaning for 25 Aug 2026. ${BOOKING_ID}.`,
    actionUrl: '/admin/financial-dashboard',
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(6),
  },
  {
    type: 'invoice-approval',
    title: 'Invoice Awaiting Review',
    message: 'INV-2026-DEMO-001 (Rs. 12,500) is ready for admin approval.',
    actionUrl: '/admin/financial-dashboard',
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(5.5),
  },
  {
    type: 'complaint-received',
    title: 'Refund Request Opened',
    message: 'Customer requested a refund of Rs. 8,000 for ' + BOOKING_ID + '.',
    actionUrl: '/refund',
    bookingId: BOOKING_ID,
    read: false,
    createdAt: hoursAgo(20),
  },
  {
    type: 'payment',
    title: 'Balance Collected',
    message: 'Balance Rs. 7,500 marked collected after service completion.',
    actionUrl: '/admin/financial-dashboard',
    bookingId: BOOKING_ID,
    read: true,
    createdAt: hoursAgo(0.2),
  },
];

const mongoTemplates = [
  {
    templateId: 'tpl_booking_confirmed',
    type: 'booking',
    channel: 'email',
    subject: 'Your Booking is Confirmed! — Cloud Laundry.lk',
    body: 'Dear {{customer_name}}, booking {{booking_id}} is confirmed for {{service_date}}.',
    variables: ['customer_name', 'booking_id', 'service_date'],
    isActive: true,
  },
  {
    templateId: 'tpl_tracking_update',
    type: 'booking',
    channel: 'in-app',
    subject: 'Order update',
    body: 'Booking {{booking_id}} status is now {{status}}.',
    variables: ['booking_id', 'status'],
    isActive: true,
  },
  {
    templateId: 'tpl_worker_arrival',
    type: 'booking',
    channel: 'email',
    subject: 'Your cleaner has arrived',
    body: '{{worker_name}} has arrived at {{address}} for booking {{booking_id}}.',
    variables: ['worker_name', 'address', 'booking_id'],
    isActive: true,
  },
  {
    templateId: 'tpl_service_complete',
    type: 'booking',
    channel: 'email',
    subject: 'Service complete',
    body: 'Service {{service_name}} for {{booking_id}} is complete.',
    variables: ['service_name', 'booking_id'],
    isActive: true,
  },
  {
    templateId: 'tpl_payment_due',
    type: 'payment',
    channel: 'email',
    subject: 'Balance payment due',
    body: 'Hi {{customer_name}}, Rs. {{balance_amount}} is due. Pay: {{payment_link}}',
    variables: ['customer_name', 'balance_amount', 'payment_link'],
    isActive: true,
  },
  {
    templateId: 'tpl_promotion',
    type: 'system',
    channel: 'email',
    subject: '{{discount}}% off this week',
    body: 'Use code {{promo_code}} on {{service_category}} services.',
    variables: ['discount', 'promo_code', 'service_category'],
    isActive: true,
  },
  {
    templateId: 'tpl_reclean',
    type: 'booking',
    channel: 'email',
    subject: 'Time for a re-clean?',
    body: 'It has been {{days_since}} days since your last {{service_name}}.',
    variables: ['days_since', 'service_name'],
    isActive: true,
  },
];

const emailVars = {
  customer_name: 'Farhath Aaysha (Demo)',
  booking_id: BOOKING_ID,
  service_name: 'Deep Cleaning + Sofa Cleaning',
  service_date: '2026-08-25',
  service_time: '10:00 AM',
  address: '42 Galle Road, Colombo 03',
  paid_amount: '5,000',
  balance_amount: '7,500',
  payment_method: 'PayHere (Card)',
  invoice_number: 'INV-2026-DEMO-001',
  payment_date: new Date().toLocaleDateString('en-LK'),
  payment_link: `${FRONTEND}/balance-payment?bookingId=${BOOKING_ID}&balance=7500`,
  amount: '7,500',
  due_date: '2026-08-26',
  refund_amount: '8,000',
  refund_reason: 'Service quality not as described',
  refund_reference: 'REF-2026-DEMO-001',
  is_online: 'true',
  failure_reason: 'Card declined (demo)',
  retry_link: `${FRONTEND}/payment/${BOOKING_ID}`,
  status: 'In Progress',
  status_detail: 'Cleaner has started Deep Cleaning at your home.',
  tracking_link: `${FRONTEND}/invoice/${BOOKING_ID}`,
  worker_name: 'Nimal Perera',
  eta: 'Now',
  completed_at: '20 Aug 2026, 12:30 PM',
  rating_link: `${FRONTEND}/invoice/${BOOKING_ID}`,
  plan_name: 'Monthly Home Cleaning',
  renewal_date: '1 Sep 2026',
  renewal_link: `${FRONTEND}/email-templates`,
  expiry_date: '5 Sep 2026',
  discount: '20',
  service_category: 'Home Cleaning',
  promo_start: '20 Aug 2026',
  promo_end: '31 Aug 2026',
  promo_code: 'AVURUDU20',
  package_name: 'Sofa + Carpet Combo',
  package_detail: 'Deep sofa shampoo plus carpet steam clean.',
  price: '9,900',
  booking_link: FRONTEND,
  points: '120',
  badge: 'Gold',
  reward: '10% off next booking',
  days_since: '32',
};

async function seedInApp() {
  await Notification.deleteMany({ userId: { $in: [ADMIN_USER, CUSTOMER_USER] } });

  const customerDocs = customerNotifs.map((n) => ({ ...n, userId: CUSTOMER_USER, updatedAt: n.createdAt }));
  const adminMirror = customerNotifs.map((n) => ({
    ...n,
    userId: ADMIN_USER,
    title: n.title,
    updatedAt: n.createdAt,
  }));
  const adminDocs = adminNotifs.map((n) => ({ ...n, userId: ADMIN_USER, updatedAt: n.createdAt }));

  const inserted = await Notification.insertMany([...customerDocs, ...adminMirror, ...adminDocs]);
  console.log(`  In-app: ${inserted.length} notifications (user-001 customer + admin-001 demo bell)`);
}

async function seedTemplates() {
  for (const tpl of mongoTemplates) {
    await NotificationTemplate.findOneAndUpdate(
      { templateId: tpl.templateId },
      tpl,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }
  console.log(`  Mongo templates: ${mongoTemplates.length} upserted`);
}

async function sendEmails() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log('  Skipping emails — GMAIL_USER / GMAIL_PASS not set');
    return;
  }
  if (!TO_EMAIL) {
    console.log('  Skipping emails — no TEST_EMAIL or GMAIL_USER');
    return;
  }

  const { transporter } = require('./utils/emailService');
  const { TEMPLATES } = require('./routes/email');
  const {
    sendPaymentConfirmationEmail,
    sendInvoiceEmail,
    sendRefundRequestEmail,
    sendRefundStatusEmail,
    sendBalanceReminderEmail,
  } = require('./utils/emailService');

  const customer = {
    name: emailVars.customer_name,
    email: TO_EMAIL,
    phone: '+94 77 123 4567',
    address: emailVars.address,
  };

  const invoice = {
    invoiceNumber: emailVars.invoice_number,
    bookingId: BOOKING_ID,
    status: 'PARTIAL',
    paidAmount: 5000,
    balanceAmount: 7500,
    totalAmount: 12500,
    customer,
  };

  console.log(`  Sending emails to ${TO_EMAIL} ...`);

  const templateIds = Object.keys(TEMPLATES);
  for (const id of templateIds) {
    const template = TEMPLATES[id];
    const subject = typeof template.subject === 'function'
      ? template.subject(emailVars)
      : fillTemplate(template.subject, emailVars);
    try {
      await transporter.sendMail({
        from: `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
        to: TO_EMAIL,
        subject: `[DEMO] ${subject}`,
        text: template.body(emailVars),
      });
      console.log(`    OK  template ${id}`);
    } catch (err) {
      console.log(`    FAIL template ${id}: ${err.message}`);
    }
    await sleep(1200);
  }

  const htmlJobs = [
    ['payment confirmation (advance)', () => sendPaymentConfirmationEmail(invoice)],
    ['invoice email', () => sendInvoiceEmail(TO_EMAIL, invoice)],
    ['refund request (admin)', () => sendRefundRequestEmail(invoice, 'Demo refund request')],
    ['refund approved', () => sendRefundStatusEmail(invoice, 'approved', '', 8000)],
    ['refund rejected', () => sendRefundStatusEmail(invoice, 'rejected', 'Demo rejection')],
    ['balance reminder first', () => sendBalanceReminderEmail(invoice, 'first')],
    ['balance reminder overdue', () => sendBalanceReminderEmail(invoice, 'overdue')],
  ];

  for (const [label, fn] of htmlJobs) {
    try {
      await fn();
      console.log(`    OK  HTML ${label}`);
    } catch (err) {
      console.log(`    FAIL HTML ${label}: ${err.message}`);
    }
    await sleep(1200);
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  if (CLEANUP) {
    const n = await Notification.deleteMany({ userId: { $in: [ADMIN_USER, CUSTOMER_USER] } });
    const t = await NotificationTemplate.deleteMany({
      templateId: { $in: mongoTemplates.map((x) => x.templateId) },
    });
    console.log(`Cleanup done (notifications: ${n.deletedCount}, templates: ${t.deletedCount})`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('Seeding notification demo data...');
  if (!EMAILS_ONLY) {
    await seedInApp();
    await seedTemplates();
  } else {
    console.log('  In-app skipped (--emails-only)');
  }

  if (!IN_APP_ONLY) {
    await sendEmails();
  } else {
    console.log('  Emails skipped (--in-app-only)');
  }

  await mongoose.disconnect();
  console.log('\nDone. Check:');
  console.log(`  Bell:            ${FRONTEND}/admin/financial-dashboard  (refresh, click bell)`);
  console.log(`  Email templates: ${FRONTEND}/email-templates`);
  if (!IN_APP_ONLY) console.log(`  Inbox:           ${TO_EMAIL}  (subjects start with [DEMO])`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
