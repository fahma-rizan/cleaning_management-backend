#!/usr/bin/env node
/**
 * ============================================================================
 * TEST ALL NOTIFICATIONS — Cloud Laundry.lk
 * ============================================================================
 *
 * This script tests EVERY notification type implemented in the system:
 *
 *   LAYER 1 — Hardcoded Email Templates (routes/email.js)
 *     1. booking-confirmed
 *     2. payment-received
 *     3. service-reminder
 *     4. payment-link          ← Payment after service completion link
 *     5. balance-due           ← Balance payment link
 *     6. refund-initiated
 *     7. payment-failed
 *
 *   LAYER 2 — Rich HTML Email Functions (utils/emailService.js)
 *     8.  sendPaymentConfirmationEmail  (advance / partial payment)
 *     9.  sendPaymentConfirmationEmail  (full payment)
 *     10. sendInvoiceEmail              (admin sends invoice to customer)
 *     11. sendRefundRequestEmail        (to admin)
 *     12. sendRefundStatusEmail         (approved)
 *     13. sendRefundStatusEmail         (rejected)
 *     14. sendBalanceReminderEmail      (first reminder)
 *     15. sendBalanceReminderEmail      (final reminder)
 *     16. sendBalanceReminderEmail      (overdue)
 *
 *   LAYER 3 — API Route Tests
 *     17. POST /api/email/payment-link       (payment after service completion)
 *     18. POST /api/email/balance-reminder   (balance payment link)
 *
 * Usage:
 *   cd backend
 *   node test-all-notifications.js
 *
 * All emails are sent to the configured GMAIL_USER (your own address).
 * ============================================================================
 */

require('dotenv').config();

const http = require('http');

// ── Config ───────────────────────────────────────────────────────────────────
const GMAIL_USER    = process.env.GMAIL_USER;
const FRONTEND_URL  = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE      = `http://localhost:${process.env.PORT || 4000}`;

// Test data
const TEST_BOOKING_ID  = 'BK-2026-TEST-001';
const TEST_INVOICE_NUM = 'INV-2026-TEST-001';
const TEST_CUSTOMER    = {
  name:   'Farhath Aaysha (Test)',
  email:  GMAIL_USER,   // sends to yourself
  phone:  '+94 77 123 4567',
  address: '42 Galle Road, Colombo 03',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];

const log = (label, status, detail = '') => {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  const msg = `${icon} [${status}] ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(msg);
  results.push({ label, status, detail });
};

/**
 * Make an HTTP request to the local backend API.
 * Uses Node's built-in http module (no axios/fetch dependency needed).
 */
const apiRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      method,
      headers:  { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 2 — Direct function calls to emailService.js
// ══════════════════════════════════════════════════════════════════════════════

async function testEmailServiceFunctions() {
  console.log('\n' + '═'.repeat(70));
  console.log('  LAYER 2 — Rich HTML Email Functions (emailService.js)');
  console.log('═'.repeat(70) + '\n');

  const {
    sendPaymentConfirmationEmail,
    sendInvoiceEmail,
    sendRefundRequestEmail,
    sendRefundStatusEmail,
    sendBalanceReminderEmail,
  } = require('./utils/emailService');

  // ── 8. Payment Confirmation — PARTIAL (advance payment) ─────────────────
  try {
    log('8. Payment Confirmation (PARTIAL/Advance)', 'SEND');
    await sendPaymentConfirmationEmail({
      invoiceNumber: TEST_INVOICE_NUM,
      bookingId:     TEST_BOOKING_ID,
      status:        'PARTIAL',
      paidAmount:    5000,
      balanceAmount: 7500,
      totalAmount:   12500,
      customer:      TEST_CUSTOMER,
    });
    log('8. Payment Confirmation (PARTIAL/Advance)', 'PASS', 'Email sent with advance badge + balance warning');
  } catch (err) {
    log('8. Payment Confirmation (PARTIAL/Advance)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 9. Payment Confirmation — FULL ──────────────────────────────────────
  try {
    log('9. Payment Confirmation (FULL)', 'SEND');
    await sendPaymentConfirmationEmail({
      invoiceNumber: 'INV-2026-TEST-002',
      bookingId:     'BK-2026-TEST-002',
      status:        'PAID',
      paidAmount:    12500,
      balanceAmount: 0,
      totalAmount:   12500,
      customer:      TEST_CUSTOMER,
    });
    log('9. Payment Confirmation (FULL)', 'PASS', 'Email sent with FULLY PAID badge');
  } catch (err) {
    log('9. Payment Confirmation (FULL)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 10. Invoice Email (admin sends to customer) ─────────────────────────
  try {
    log('10. Invoice Email (manual send)', 'SEND');
    await sendInvoiceEmail(GMAIL_USER, {
      invoiceNumber: TEST_INVOICE_NUM,
      bookingId:     TEST_BOOKING_ID,
      totalAmount:   12500,
      paidAmount:    5000,
      balanceAmount: 7500,
      status:        'PARTIAL',
      customer:      TEST_CUSTOMER,
    });
    log('10. Invoice Email (manual send)', 'PASS', 'Invoice with View Invoice CTA button');
  } catch (err) {
    log('10. Invoice Email (manual send)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 11. Refund Request Email (to admin) ─────────────────────────────────
  try {
    log('11. Refund Request (to admin)', 'SEND');
    await sendRefundRequestEmail(
      {
        invoiceNumber: TEST_INVOICE_NUM,
        paidAmount:    12500,
        customer:      TEST_CUSTOMER,
      },
      'Service was not completed as described — furniture was damaged during cleaning.'
    );
    log('11. Refund Request (to admin)', 'PASS', 'Admin notification with reason');
  } catch (err) {
    log('11. Refund Request (to admin)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 12. Refund Status — APPROVED ────────────────────────────────────────
  try {
    log('12. Refund Status (Approved)', 'SEND');
    await sendRefundStatusEmail(
      {
        invoiceNumber: TEST_INVOICE_NUM,
        bookingId:     TEST_BOOKING_ID,
        paidAmount:    12500,
        customer:      TEST_CUSTOMER,
      },
      'approved',
      '',
      8000  // refund amount
    );
    log('12. Refund Status (Approved)', 'PASS', 'Rs. 8,000 refund approved with timeline');
  } catch (err) {
    log('12. Refund Status (Approved)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 13. Refund Status — REJECTED ────────────────────────────────────────
  try {
    log('13. Refund Status (Rejected)', 'SEND');
    await sendRefundStatusEmail(
      {
        invoiceNumber: 'INV-2026-TEST-003',
        bookingId:     'BK-2026-TEST-003',
        paidAmount:    6000,
        customer:      TEST_CUSTOMER,
      },
      'rejected',
      'Service was completed as per the agreement. No damage evidence provided.'
    );
    log('13. Refund Status (Rejected)', 'PASS', 'Rejection with reason + support contact');
  } catch (err) {
    log('13. Refund Status (Rejected)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 14. Balance Reminder — FIRST ────────────────────────────────────────
  try {
    log('14. Balance Reminder (First)', 'SEND');
    await sendBalanceReminderEmail(
      {
        invoiceNumber: TEST_INVOICE_NUM,
        bookingId:     TEST_BOOKING_ID,
        balanceAmount: 7500,
        customer:      TEST_CUSTOMER,
      },
      'first'
    );
    log('14. Balance Reminder (First)', 'PASS', 'Friendly reminder with Pay Now link');
  } catch (err) {
    log('14. Balance Reminder (First)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 15. Balance Reminder — FINAL ────────────────────────────────────────
  try {
    log('15. Balance Reminder (Final)', 'SEND');
    await sendBalanceReminderEmail(
      {
        invoiceNumber: TEST_INVOICE_NUM,
        bookingId:     TEST_BOOKING_ID,
        balanceAmount: 7500,
        customer:      TEST_CUSTOMER,
      },
      'final'
    );
    log('15. Balance Reminder (Final)', 'PASS', 'Final reminder with amber urgency colour');
  } catch (err) {
    log('15. Balance Reminder (Final)', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 16. Balance Reminder — OVERDUE ──────────────────────────────────────
  try {
    log('16. Balance Reminder (Overdue)', 'SEND');
    await sendBalanceReminderEmail(
      {
        invoiceNumber: TEST_INVOICE_NUM,
        bookingId:     TEST_BOOKING_ID,
        balanceAmount: 7500,
        customer:      TEST_CUSTOMER,
      },
      'overdue'
    );
    log('16. Balance Reminder (Overdue)', 'PASS', 'RED overdue notice with payment link');
  } catch (err) {
    log('16. Balance Reminder (Overdue)', 'FAIL', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 1 — Hardcoded Email Templates via API (routes/email.js)
//  LAYER 3 — Dedicated API route tests
// ══════════════════════════════════════════════════════════════════════════════

async function testEmailTemplatesViaAPI() {
  console.log('\n' + '═'.repeat(70));
  console.log('  LAYER 1 — Hardcoded Email Templates via POST /api/email/send');
  console.log('═'.repeat(70) + '\n');

  const templates = [
    {
      num:        1,
      templateId: 'booking-confirmed',
      label:      'Booking Confirmed',
      variables: {
        customer_name:  TEST_CUSTOMER.name,
        booking_id:     TEST_BOOKING_ID,
        service_name:   'Deep Cleaning + Sofa Cleaning',
        service_date:   '2026-08-25',
        service_time:   '10:00 AM',
        address:        TEST_CUSTOMER.address,
        paid_amount:    '5,000',
        balance_amount: '7,500',
        payment_method: 'PayHere (Card)',
      },
    },
    {
      num:        2,
      templateId: 'payment-received',
      label:      'Payment Received',
      variables: {
        customer_name:  TEST_CUSTOMER.name,
        invoice_number: TEST_INVOICE_NUM,
        booking_id:     TEST_BOOKING_ID,
        service_name:   'Deep Cleaning + Sofa Cleaning',
        paid_amount:    '5,000',
        balance_amount: 7500,
        payment_method: 'PayHere (Card)',
        payment_date:   new Date().toLocaleDateString('en-LK'),
      },
    },
    {
      num:        3,
      templateId: 'service-reminder',
      label:      'Service Reminder (Tomorrow)',
      variables: {
        customer_name: TEST_CUSTOMER.name,
        service_name:  'Deep Cleaning',
        service_date:  '2026-08-25',
        service_time:  '10:00 AM',
        booking_id:    TEST_BOOKING_ID,
      },
    },
    {
      num:        4,
      templateId: 'payment-link',
      label:      'Payment Link (After Service Completion)',
      variables: {
        customer_name: TEST_CUSTOMER.name,
        service_name:  'Deep Cleaning + Sofa Cleaning',
        booking_id:    TEST_BOOKING_ID,
        amount:        '7,500',
        payment_link:  `${FRONTEND_URL}/payment-link?bookingId=${TEST_BOOKING_ID}&amount=7500`,
        due_date:      '2026-08-26 (within 24 hours)',
      },
    },
    {
      num:        5,
      templateId: 'balance-due',
      label:      'Balance Due Reminder',
      variables: {
        customer_name:  TEST_CUSTOMER.name,
        service_name:   'Deep Cleaning + Sofa Cleaning',
        booking_id:     TEST_BOOKING_ID,
        balance_amount: '7,500',
        paid_amount:    '5,000',
        payment_link:   `${FRONTEND_URL}/balance-payment?bookingId=${TEST_BOOKING_ID}&balance=7500`,
      },
    },
    {
      num:        6,
      templateId: 'refund-initiated',
      label:      'Refund Initiated',
      variables: {
        customer_name:    TEST_CUSTOMER.name,
        refund_amount:    '8,000',
        booking_id:       TEST_BOOKING_ID,
        refund_reason:    'Service quality not as described',
        refund_reference: 'REF-2026-001',
        is_online:        'true',
      },
    },
    {
      num:        7,
      templateId: 'payment-failed',
      label:      'Payment Failed',
      variables: {
        customer_name:  TEST_CUSTOMER.name,
        booking_id:     TEST_BOOKING_ID,
        amount:         '12,500',
        failure_reason: 'Card declined by bank (insufficient funds)',
        retry_link:     `${FRONTEND_URL}/payment?bookingId=${TEST_BOOKING_ID}`,
      },
    },
    {
      num:        19,
      templateId: 'tracking-update',
      label:      'Tracking Update',
      variables: {
        customer_name: TEST_CUSTOMER.name,
        booking_id:    TEST_BOOKING_ID,
        service_name:  'Deep Cleaning',
        status:        'In Progress',
        status_detail: 'Cleaner has started work at your home.',
        tracking_link: `${FRONTEND_URL}/invoice/${TEST_BOOKING_ID}`,
      },
    },
    {
      num:        20,
      templateId: 'worker-arrival',
      label:      'Worker Arrival',
      variables: {
        customer_name: TEST_CUSTOMER.name,
        booking_id:    TEST_BOOKING_ID,
        service_name:  'Deep Cleaning',
        worker_name:   'Nimal Perera',
        address:       TEST_CUSTOMER.address,
        eta:           'Now',
      },
    },
    {
      num:        21,
      templateId: 'service-complete',
      label:      'Service Complete',
      variables: {
        customer_name:  TEST_CUSTOMER.name,
        service_name:   'Deep Cleaning',
        booking_id:     TEST_BOOKING_ID,
        completed_at:   '20 Aug 2026, 12:30 PM',
        worker_name:    'Nimal Perera',
        balance_amount: '7,500',
        payment_link:   `${FRONTEND_URL}/balance-payment?bookingId=${TEST_BOOKING_ID}&balance=7500`,
        rating_link:    `${FRONTEND_URL}/invoice/${TEST_BOOKING_ID}`,
      },
    },
    {
      num:        22,
      templateId: 'promotion',
      label:      'Festive Promotion',
      variables: {
        customer_name:     TEST_CUSTOMER.name,
        discount:          '20',
        service_category:  'Home Cleaning',
        promo_start:       '20 Aug 2026',
        promo_end:         '31 Aug 2026',
        promo_code:        'AVURUDU20',
      },
    },
    {
      num:        23,
      templateId: 're-clean-reminder',
      label:      'History-Based Re-Clean',
      variables: {
        customer_name: TEST_CUSTOMER.name,
        days_since:    '32',
        service_name:  'Deep Cleaning',
        promo_code:    'RE-CLEAN10',
      },
    },
  ];

  for (const tpl of templates) {
    try {
      log(`${tpl.num}. ${tpl.label} (template: ${tpl.templateId})`, 'SEND');
      const res = await apiRequest('POST', '/api/email/send', {
        templateId: tpl.templateId,
        to:         GMAIL_USER,
        variables:  tpl.variables,
      });

      if (res.status === 200) {
        log(`${tpl.num}. ${tpl.label}`, 'PASS', `Email sent via template "${tpl.templateId}"`);
      } else {
        log(`${tpl.num}. ${tpl.label}`, 'FAIL', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } catch (err) {
      log(`${tpl.num}. ${tpl.label}`, 'FAIL', err.message);
    }
    await sleep(1500);
  }

  // ── LAYER 3: Dedicated API route tests ──────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  LAYER 3 — Dedicated API Routes (payment-link & balance-reminder)');
  console.log('═'.repeat(70) + '\n');

  // ── 17. POST /api/email/payment-link ────────────────────────────────────
  try {
    log('17. POST /api/email/payment-link', 'SEND');
    const res = await apiRequest('POST', '/api/email/payment-link', {
      to:           GMAIL_USER,
      customerName: TEST_CUSTOMER.name,
      bookingId:    TEST_BOOKING_ID,
      serviceType:  'Deep Cleaning + Sofa Cleaning',
      amount:       7500,
      dueDate:      '2026-08-26',
    });

    if (res.status === 200) {
      log('17. POST /api/email/payment-link', 'PASS',
        `Payment link: ${res.body.paymentLink}`);
    } else {
      log('17. POST /api/email/payment-link', 'FAIL', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    log('17. POST /api/email/payment-link', 'FAIL', err.message);
  }

  await sleep(1500);

  // ── 18. POST /api/email/balance-reminder ────────────────────────────────
  try {
    log('18. POST /api/email/balance-reminder', 'SEND');
    const res = await apiRequest('POST', '/api/email/balance-reminder', {
      to:            GMAIL_USER,
      customerName:  TEST_CUSTOMER.name,
      bookingId:     TEST_BOOKING_ID,
      serviceType:   'Deep Cleaning + Sofa Cleaning',
      balanceAmount: 7500,
      paidAmount:    5000,
    });

    if (res.status === 200) {
      log('18. POST /api/email/balance-reminder', 'PASS',
        `Balance payment link: ${res.body.paymentLink}`);
    } else {
      log('18. POST /api/email/balance-reminder', 'FAIL', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    log('18. POST /api/email/balance-reminder', 'FAIL', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + '  CLOUD LAUNDRY — NOTIFICATION SYSTEM TEST SUITE'.padEnd(68) + '║');
  console.log('╠' + '═'.repeat(68) + '╣');
  console.log('║' + `  Sending all emails to: ${GMAIL_USER}`.padEnd(68) + '║');
  console.log('║' + `  Frontend URL: ${FRONTEND_URL}`.padEnd(68) + '║');
  console.log('║' + `  Backend API:  ${API_BASE}`.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');

  if (!GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error('❌ GMAIL_USER or GMAIL_PASS not set in .env — cannot send emails.');
    process.exit(1);
  }

  // ── LAYER 2: Direct function calls (no server needed) ──────────────────
  await testEmailServiceFunctions();

  // ── LAYER 1 & 3: API routes (server must be running) ───────────────────
  console.log('\n' + '─'.repeat(70));
  console.log('  Now testing API routes (requires backend server on port 4000)...');
  console.log('─'.repeat(70));

  try {
    // Quick health check
    await apiRequest('GET', '/api/notifications');
    console.log('  ✅ Backend server is reachable\n');
  } catch {
    console.log('  ⚠️  Backend server not reachable — skipping API route tests.');
    console.log('     Start the server with: cd backend && node server.js\n');
    printSummary();
    return;
  }

  await testEmailTemplatesViaAPI();

  // ── Summary ────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total  = results.filter(r => r.status !== 'SEND').length;

  console.log(`\n  Total: ${total}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('  Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.label}: ${r.detail}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log('  📧 Check your Gmail inbox for all notification emails!');
  console.log('  📎 Look for these key links in the emails:');
  console.log(`     • Balance Payment: ${FRONTEND_URL}/balance-payment?bookingId=${TEST_BOOKING_ID}&balance=7500`);
  console.log(`     • Payment Link:    ${FRONTEND_URL}/payment-link?bookingId=${TEST_BOOKING_ID}&amount=7500`);
  console.log(`     • Invoice View:    ${FRONTEND_URL}/invoice/${TEST_BOOKING_ID}`);
  console.log('─'.repeat(70) + '\n');

  console.log('  ┌──────────────────────────────────────────────────────────────────┐');
  console.log('  │  HOW EMAIL TEMPLATES WORK IN THIS SYSTEM                        │');
  console.log('  ├──────────────────────────────────────────────────────────────────┤');
  console.log('  │                                                                  │');
  console.log('  │  LAYER 1: Hardcoded Templates (routes/email.js)                 │');
  console.log('  │  → 7 plain-text templates with variable substitution            │');
  console.log('  │  → Sent via POST /api/email/send { templateId, to, variables }  │');
  console.log('  │  → Used for: booking confirm, payment received, reminders       │');
  console.log('  │                                                                  │');
  console.log('  │  LAYER 2: Rich HTML Emails (utils/emailService.js)              │');
  console.log('  │  → 5 functions with branded HTML template wrapper               │');
  console.log('  │  → Purple gradient header, detail boxes, CTA buttons            │');
  console.log('  │  → Auto-triggered by payment/refund/reminder workflows          │');
  console.log('  │                                                                  │');
  console.log('  │  LAYER 3: Dynamic Templates (MongoDB NotificationTemplate)      │');
  console.log('  │  → Admin-managed via NotificationTemplateManager UI             │');
  console.log('  │  → CRUD operations + {{variable}} placeholder rendering         │');
  console.log('  │  → Supports email, in-app, SMS channels                         │');
  console.log('  │  → Future-ready: connect to sending logic when needed           │');
  console.log('  │                                                                  │');
  console.log('  └──────────────────────────────────────────────────────────────────┘\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
