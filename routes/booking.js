const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/authorization');

const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const Refund = require('../models/Refund');
const Notification = require('../models/Notification');
const { determineInvoiceDetails, generateInvoiceNumber } = require('../utils/invoiceUtils');
// NEW — the payment ledger. See models/Payment.js / utils/paymentLedger.js.
const { recordPayment } = require('../utils/paymentLedger');
// NEW (A.3, Tier 1.4) — send the balance payment link immediately when an
// online balance invoice is created, instead of only via the hourly
// reminder cron (utils/reminderScheduler.js), which could leave a customer
// waiting up to an hour before the very first email ever goes out.
const { sendBalanceReminderEmail } = require('../utils/emailService');
const PaymentReminder = require('../models/PaymentReminder');

/**
 * Creates a PENDING Refund for a booking's paid invoice, if one exists and
 * something was actually paid — and marks that invoice REFUND_PENDING.
 * No-op (returns false) if there's nothing paid to refund, or a refund is
 * already in flight for this invoice.
 *
 * Extracted so the three places that need "cancel this booking + trigger a
 * refund if it was paid" (customer /cancel below, /decline-reschedule, and
 * the new admin /admin-cancel) share one implementation instead of three
 * copies that could drift apart. Behavior is unchanged from what /cancel
 * and /decline-reschedule already did individually.
 */
/**
 * A.7 — shared cancellation-eligibility check, moved here from
 * refundController.requestRefund (the invoice-based refund-request path)
 * so that /:id/cancel (customer self-service, below) and /:id/admin-cancel
 * apply the SAME rule. Previously this check only lived inside
 * refundController.requestRefund — a separate, invoice-level endpoint
 * nothing in the live app actually calls (CancelPage.tsx, the real routed
 * cancel UI, calls booking cancel routes, not /api/refunds/request) — so in
 * practice neither cancel route ever enforced the cutoff/service-started
 * policy at all.
 *
 * Returns:
 *   { allowed: false, message, ... }                 — service already
 *     started/completed; caller should not cancel at all, direct them to
 *     Price Reduction instead.
 *   { allowed: true, refundEligible: false, message } — still before
 *     service, but inside the no-auto-refund cutoff window; cancellation
 *     itself is fine, but don't auto-create a refund — tell the customer
 *     to contact support.
 *   { allowed: true, refundEligible: true }            — normal case.
 */
function assessCancellation(booking) {
  const serviceStarted = ['in-progress', 'completed'].includes(booking.status)
    || booking.taskStartedAt;
  if (serviceStarted) {
    return {
      allowed: false,
      message: 'This service has already started or been completed, so it can no longer be cancelled. For post-service concerns, please use the Price Reduction page instead.',
    };
  }

  const POLICY_CUTOFF_HOURS = parseInt(process.env.CANCELLATION_CUTOFF_HOURS || '24', 10);
  const now = new Date();
  let serviceStart = null;
  if (booking.date) {
    const dateParts = booking.date.split('-').map(Number);
    serviceStart = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    if (booking.time) {
      const tm = booking.time.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
      if (tm) {
        let h = parseInt(tm[1], 10);
        const m = parseInt(tm[2], 10);
        const isPM = tm[3].toUpperCase() === 'PM';
        if (isPM && h !== 12) h += 12;
        if (!isPM && h === 12) h = 0;
        serviceStart.setHours(h, m, 0, 0);
      }
    }
  }

  if (serviceStart) {
    const cutoff = new Date(serviceStart.getTime() - POLICY_CUTOFF_HOURS * 3600000);
    if (now > cutoff) {
      return {
        allowed: true,
        refundEligible: false,
        message: "We're sorry, but cancellations within 24 hours of the scheduled service are not eligible for an automatic refund. Your booking has been cancelled — please contact our customer care team to discuss your refund options.",
        contactRequired: true,
        contactPhone: process.env.SUPPORT_PHONE || 'info@cloudlaundry.lk',
        contactLink: '/contact',
      };
    }
  }

  return { allowed: true, refundEligible: true };
}

async function triggerRefundIfPaid(booking, reason) {
  const invoice = await Invoice.findOne({ bookingId: booking._id }) || await Invoice.findOne({ invoiceNumber: booking.bookingId });
  const paidAmt = (invoice && invoice.paidAmount) || booking.paidAmount || booking.advanceAmount || 0;

  if (!invoice || paidAmt <= 0) return false;

  const existingRefund = await Refund.findOne({ invoice: invoice._id, status: { $in: ['PENDING', 'APPROVED'] } });
  if (existingRefund) return false;

  const refund = new Refund({
    invoice: invoice._id,
    reason,
    status: 'PENDING',
    refundedAmount: paidAmt,
  });
  await refund.save();

  invoice.status = 'REFUND_PENDING';
  await invoice.save({ validateBeforeSave: false });

  return true;
}

/**
 * @route   GET /api/bookings
 * @desc    Get all bookings (staff/admin/manager), or just the logged-in
 *          customer's own bookings (role 'customer') — e.g. for the
 *          customer-facing "My Bookings" page.
 * @access  Private
 *
 * FIX: this previously returned ALL bookings to any authenticated caller,
 * which is fine for staff/admin dashboards but would leak every other
 * customer's bookings to a plain customer account. Now filters by
 * req.user.id when the caller's role is 'customer'.
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const filter = req.user?.role === 'customer' ? { customerId: req.user.id } : {};
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/bookings/by-ref/:checkoutRef
 * @desc    Look up a booking by its one-time online-checkout correlation
 *          token. Used by PaymentGatewayPage to find out whether the
 *          PayHere webhook has finished creating the real Booking yet —
 *          nothing exists under this token until payment actually succeeds,
 *          so a 404 here just means "still processing" (or payment failed),
 *          not an error.
 * @access  Public (no auth — polled right after an anonymous PayHere
 *          checkout redirect, before any session is guaranteed to exist)
 */
router.get('/by-ref/:checkoutRef', async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ checkoutRef: req.params.checkoutRef });
    if (!booking) {
      return res.status(404).json({ msg: 'Not created yet.' });
    }
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking details by ID — accepts either a MongoDB ObjectId
 *          or the human-readable bookingId string (e.g. BK-...)
 * @access  Public (no auth — needed for QR-code-scanned pages like
 *          JobCompletePage and PaymentGatewayPage's polling check, which
 *          may not have an active session token)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const param = req.params.id;

    // Try by MongoDB ObjectId first
    let booking = null;
    if (mongoose.Types.ObjectId.isValid(param)) {
      booking = await Booking.findById(param);
    }

    // If not found, try searching by the human-friendly bookingId field (e.g. BK-...)
    if (!booking) {
      booking = await Booking.findOne({ bookingId: param });
    }

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    next(err);
  }
});

/**
 * @route   POST /api/bookings
 * @desc    Create a booking for COD or Pay-After-Completion, at the moment
 *          the customer clicks "Confirm Booking". Neither method involves a
 *          payment gateway at booking time, so there's no reason to wait —
 *          the booking (and its bookingId) is created right here, and the
 *          response is what the frontend uses to redirect to /booking-success.
 *
 *          Full Online and Advance+Balance bookings do NOT go through this
 *          route at all — those are created later, by the PayHere webhook,
 *          only once payment has actually succeeded (see routes/payhere.js
 *          POST /notify). Nothing is written to the database for an online
 *          booking before that point.
 *
 *          Per spec A.5/B.3: no invoice is created here. For COD, the
 *          invoice is generated by staff after the job is completed. For
 *          Pay-After-Completion, same trigger — staff generate it once the
 *          job is done and the customer pays via the emailed link.
 * @access  Public
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      customerId, customerName, customerEmail,
      serviceName, serviceType, serviceCategory, serviceItems,
      date, time, address, paymentMethod,
    } = req.body;

    if (!customerId || !customerEmail || !serviceName || !date || !time || !address || !paymentMethod) {
      return res.status(400).json({ msg: 'Missing required booking details.' });
    }

    if (!['cod', 'pay-after-completion'].includes(paymentMethod)) {
      return res.status(400).json({
        msg: "This endpoint only creates 'cod' or 'pay-after-completion' bookings. " +
             'Full Online and Advance+Balance bookings are created automatically once payment succeeds.',
      });
    }

    let resolvedCustomerId = customerId;
    if (!mongoose.Types.ObjectId.isValid(resolvedCustomerId)) {
      if (process.env.NODE_ENV !== 'development') {
        return res.status(400).json({ msg: 'A valid customer account is required.' });
      }
      const User = require('../models/User');
      const demoCustomer = await User.findOne({
        email: customerEmail || 'seed-temp-customer@local',
        role: 'customer',
      });
      if (!demoCustomer) {
        return res.status(400).json({
          msg: 'The local demo customer is not configured. Run backend/seed-one-booking.js or sign in as a customer.',
        });
      }
      resolvedCustomerId = demoCustomer._id;
    }

    const price = (serviceItems && serviceItems.length > 0)
      ? serviceItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0)
      : 0;

    const newBooking = new Booking({
      customerId: resolvedCustomerId,
      customerName,
      customerEmail,
      serviceName,
      serviceType,
      serviceCategory,
      serviceItems,
      date,
      time,
      address,
      price,
      paidAmount:    0,
      balanceAmount: price,   // nothing collected yet for either method
      paymentMethod,          // 'cod' | 'pay-after-completion'
      status:        'pending', // spec A.5: booking exists, nothing charged yet
    });

    await newBooking.save(); // bookingId is assigned here, by the pre-save hook

    // FIX (Tier 2.3, C.1 — critical): COD/Pay-After-Completion booking
    // creation previously sent nothing at all — no notification, no email —
    // on success. (Full Online/Advance+Balance already got a notification +
    // email from routes/payhere.js's /notify webhook.) Reuses the
    // 'booking-confirmed' template in routes/email.js, which already
    // existed but was never auto-triggered by anything.
    try {
      await Notification.create({
        userId:    resolvedCustomerId,
        type:      'order-confirmed',
        title:     'Booking Confirmed',
        message:   `Your booking ${newBooking.bookingId} for ${serviceName} on ${date} at ${time} is confirmed.`,
        actionUrl: `/my-bookings`,
        bookingId: newBooking._id,
      });
      const { TEMPLATES } = require('./email');
      const { transporter } = require('../utils/emailService');
      const variables = {
        customer_name:  customerName || 'Customer',
        booking_id:     newBooking.bookingId,
        service_name:   serviceName,
        service_date:   date,
        service_time:   time,
        address,
        paid_amount:    '0',
        balance_amount: price.toLocaleString(),
        payment_method: paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment After Completion',
      };
      await transporter.sendMail({
        from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
        to:      customerEmail,
        subject: TEMPLATES['booking-confirmed'].subject,
        text:    TEMPLATES['booking-confirmed'].body(variables),
      });
    } catch (notifyErr) {
      console.warn('Booking created but confirmation notification/email failed:', notifyErr.message);
    }

    res.status(201).json(newBooking);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/cancel
 * @desc    Cancel a booking and create a refund request for the advance
 * @access  Private
 *
 * FIX 1: Added auth middleware — unauthenticated users could previously cancel
 *         any booking by guessing the ID.
 * FIX 2: Refund now links to the correct Invoice._id (not booking._id).
 *         The Refund model's 'invoice' field is a reference to the Invoice
 *         collection — storing a Booking _id broke populate() in the admin panel.
 */
router.post('/:id/cancel', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // Only the owner can cancel their booking
    if (booking.customerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorised to cancel this booking' });
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return res.status(400).json({ msg: `Booking is already ${booking.status.toLowerCase()}` });
    }

    // A.7: enforce the same service-started/cutoff policy the invoice-level
    // refund-request endpoint always had — see assessCancellation() above.
    const eligibility = assessCancellation(booking);
    if (!eligibility.allowed) {
      return res.status(400).json({ msg: eligibility.message });
    }

    booking.status = 'cancelled';
    await booking.save();

    let refundCreated = false;
    if (eligibility.refundEligible) {
      // Create a refund if an invoice exists and customer paid before service
      // (paid -> refund PENDING; unpaid -> no-op). See triggerRefundIfPaid above.
      refundCreated = await triggerRefundIfPaid(booking, 'Booking cancelled by customer');
    }

    res.json({
      msg: eligibility.refundEligible
        ? 'Booking cancelled and refund process initiated if payment was made'
        : eligibility.message,
      contactRequired: eligibility.contactRequired || false,
      contactPhone: eligibility.contactPhone,
      contactLink: eligibility.contactLink,
      refundCreated,
      booking,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Creates whichever invoice belongs at booking-completion time, for any of
 * the 4 payment methods, and returns it (already saved).
 *
 * FIX (A.4/B.1 — the invoice double-counting bug): for 'advance-balance'
 * bookings, this used to always mint a brand-new, unlinked invoice for the
 * remaining balance. Because the original advance invoice's totalAmount is
 * (correctly) the FULL booking price, and this second invoice ALSO carried
 * its own totalAmount for the remaining 80%, any dashboard summing
 * `totalAmount` across all invoices reported ~180% of the real order value.
 * The Invoice schema already had `isBalanceInvoice` / `parentInvoiceId`
 * fields sitting unused for exactly this — now they're actually set:
 *   - the new invoice number is `<original>-BAL`, not a fresh sequence number
 *   - isBalanceInvoice: true, parentInvoiceId: <the original invoice's _id>
 *   - the ORIGINAL invoice's balanceAmount is zeroed out here, since the
 *     remaining balance is now tracked on this linked invoice instead —
 *     nothing is ever left tracked in two places at once.
 * `paidAmount` was never the problem (each invoice's own paidAmount is a
 * real, non-overlapping amount — summing it across invoices was always
 * correct); this only fixes `totalAmount`/`balanceAmount` accounting.
 *
 * For COD / Pay-After-Completion this is simply the booking's first and
 * only invoice — no original to link to, so isBalanceInvoice stays false
 * and it gets a normal fresh invoice number, same as before.
 *
 * @param booking   the Booking document (not yet marked completed)
 * @param markPaid  true if payment was already collected (cash, on the
 *                  spot) — false leaves the invoice SENT/unpaid, for the
 *                  online-balance-payment-link sub-flow (A.3) which still
 *                  needs its own "customer actually paid" trigger — that
 *                  part remains a stub; this only fixes the invoice linking
 *                  and the double-count, not the payment-link email itself.
 */
async function createCompletionInvoice(booking, { markPaid }) {
  const isCod                = booking.paymentMethod === 'cod';
  const isPayAfterCompletion = booking.paymentMethod === 'pay-after-completion';
  const isAdvanceBalance     = booking.paymentMethod === 'advance-balance';

  const customer = {
    userId:  booking.customerId,
    name:    booking.customerName || 'Customer',
    // FIX: Booking schema stores this as customerEmail, not email.
    // booking.email was always undefined, which failed the Invoice
    // model's required customer.email validation with a 400 error.
    email:   booking.customerEmail || booking.email || 'no-reply@cloudlaundry.lk',
    address: booking.address,
  };
  const serviceItems = (booking.serviceItems && booking.serviceItems.length > 0)
    ? booking.serviceItems.map(item => ({ name: item.name, price: item.price, quantity: 1 }))
    : [{ name: booking.serviceName || 'Service', price: booking.balanceAmount, quantity: 1 }];

  let originalInvoice = null;
  if (isAdvanceBalance) {
    originalInvoice = await Invoice.findOne({ bookingId: booking._id, isBalanceInvoice: { $ne: true } });
  }

  if (originalInvoice) {
    // Genuine A.4/B.1 balance settlement — link it to the original.
    const balanceInvoice = new Invoice({
      invoiceNumber:  `${originalInvoice.invoiceNumber}-BAL`,
      invoiceType:    'FINAL',
      isBalanceInvoice: true,
      parentInvoiceId:  originalInvoice._id,
      mainCategories: originalInvoice.mainCategories,
      bookingId: booking._id,
      customer,
      serviceItems,
      subTotal:      booking.balanceAmount,
      totalAmount:   booking.balanceAmount,
      paidAmount:    markPaid ? booking.balanceAmount : 0,
      balanceAmount: markPaid ? 0 : booking.balanceAmount,
      // FIX (Tier 1.4 label fix, per spec): was 'Advance + Balance (Cash)'/
      // '(Online)' — spec calls for these exact labels instead. See
      // PaymentReportExport.tsx's rawMethod parsing for the matching update
      // that keeps these still categorizing correctly in the payment report.
      paymentMethod: markPaid ? 'COD' : 'Online Balance Payment',
      // FIX (Tier 3.3, audit finding B.1 "Status/label mismatches — 'SENT'
      // instead of 'PENDING', which isn't even a valid status"): this used
      // 'SENT', a status this codebase's convention (see B.3's already-
      // correct 'UNPAID' for Pay-After-Completion, models/Invoice.js's enum
      // comment) reserves for "created/approved, no particular amount-owed
      // semantics" — not for "an invoice exists and this specific amount is
      // due now," which is what an unsettled balance invoice actually is.
      // 'UNPAID' is the value already used correctly for that exact meaning
      // elsewhere in this same function (see the COD/PAC branch below) —
      // using it here too makes both branches consistent with each other
      // and with the spec.
      status: markPaid ? 'PAID' : 'UNPAID',
    });
    await balanceInvoice.save();

    // NEW — log the cash collection (if any) to the payment ledger.
    // markPaid=false here means the balance is going out via the
    // online-payment-link sub-flow (A.3) — nothing collected yet, so
    // nothing to log until that actually confirms.
    if (markPaid) {
      await recordPayment({
        invoiceId:  balanceInvoice._id,
        bookingId:  booking._id,
        customerId: booking.customerId,
        amount:     booking.balanceAmount,
        direction:  'CHARGE',
        method:     'cash',
        label:      'Advance+Balance settlement (cash, on-site)',
      });
    } else {
      // FIX (Tier 1.4): send the balance payment link the moment this
      // invoice exists, instead of waiting for the hourly reminder cron
      // (utils/reminderScheduler.js) to pick it up on its next run. Also
      // logs a PaymentReminder('first') record so the cron's own dedup
      // check (hasAlreadySentReminder) sees this as already sent and
      // doesn't email the customer a second "first" reminder later.
      try {
        await sendBalanceReminderEmail(balanceInvoice, 'first');
        await PaymentReminder.create({
          invoiceId:     balanceInvoice._id,
          invoiceNumber: balanceInvoice.invoiceNumber,
          customerId:    booking.customerId?.toString() || 'unknown',
          customerEmail: customer.email,
          amount:        balanceInvoice.balanceAmount,
          dueDate:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reminderType:  'first',
          status:        'sent',
        });
      } catch (emailErr) {
        console.warn('Balance invoice created but immediate email failed (cron will retry):', emailErr.message);
      }
    }

    // The remaining balance now lives on this linked invoice, not the
    // original — zero it out there so nothing is double-tracked. Not a
    // ledger event (no money moved against originalInvoice itself).
    originalInvoice.balanceAmount = 0;
    await originalInvoice.save({ validateBeforeSave: false });

    return balanceInvoice;
  }

  // COD / Pay-After-Completion — this booking's first and only invoice, or
  // an advance-balance booking whose original invoice genuinely can't be
  // found (shouldn't happen in practice, but don't invent a fake -BAL link).
  const { prefix, categories } = determineInvoiceDetails(booking.serviceItems);
  const invoiceNumber = await generateInvoiceNumber(prefix);

  const invoice = new Invoice({
    invoiceNumber,
    invoiceType: isCod ? 'COD' : 'FINAL',
    mainCategories: categories,
    bookingId: booking._id,
    customer,
    serviceItems,
    subTotal:      booking.balanceAmount,
    totalAmount:   booking.balanceAmount,
    paidAmount:    isCod || markPaid ? booking.balanceAmount : 0,
    balanceAmount: isCod || markPaid ? 0 : booking.balanceAmount,
    paymentMethod: isCod
      ? 'Cash on Delivery'
      : isPayAfterCompletion
        ? 'Online Payment After Completion'
        : '',
    // FIX (Tier 3.3): the trailing 'SENT' fallback here only fires for the
    // "advance-balance booking whose original invoice genuinely can't be
    // found" edge case noted in this function's own doc comment above — an
    // unpaid amount is owed either way, so it should carry the same
    // 'UNPAID' status as the isPayAfterCompletion branch right next to it,
    // not the different 'SENT' value.
    status: (isCod || markPaid) ? 'PAID' : 'UNPAID',
  });
  await invoice.save();

  // NEW — log the collection to the payment ledger (mirrors the exact
  // same condition used for paidAmount/status above). Nothing to log for
  // Pay-After-Completion-online / an unpaid advance-balance remainder —
  // no money has moved yet.
  if (isCod || markPaid) {
    await recordPayment({
      invoiceId:  invoice._id,
      bookingId:  booking._id,
      customerId: booking.customerId,
      amount:     booking.balanceAmount,
      direction:  'CHARGE',
      method:     isCod ? 'cod' : 'cash',
      label:      isCod ? 'COD collection (on completion)' : 'Pay-After-Completion collection (cash, on-site)',
    });
  } else if (isPayAfterCompletion) {
    // FIX (Tier 1.5, B.3 — critical): this invoice previously went out
    // status UNPAID with no email ever sent at creation, and (see the
    // matching fix in utils/reminderScheduler.js) the hourly reminder
    // cron's query didn't even include UNPAID invoices in its search —
    // so a customer who chose Pay-After-Completion had no way to ever
    // pay online. Same immediate-send + PaymentReminder('first') log
    // pattern as the online-balance case above.
    try {
      await sendBalanceReminderEmail(invoice, 'first');
      await PaymentReminder.create({
        invoiceId:     invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerId:    booking.customerId?.toString() || 'unknown',
        customerEmail: customer.email,
        amount:        invoice.balanceAmount,
        dueDate:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reminderType:  'first',
        status:        'sent',
      });
    } catch (emailErr) {
      console.warn('Pay-After-Completion invoice created but immediate email failed (cron will retry once UNPAID is included):', emailErr.message);
    }
  }

  return invoice;
}

/**
 * @route   POST /api/bookings/:id/record-cash-payment
 * @desc    Staff confirms the outstanding balance was collected in cash
 *          on-site (A.3's COD-balance sub-flow, for 'advance-balance'
 *          bookings). No admin approval step — intentionally lightweight,
 *          same as the standard COD flow.
 * @access  Private (Staff)
 *
 * FIX: previously only flipped fields on the Booking document and never
 * touched the Invoice collection at all — so cash genuinely collected
 * on-site was invisible everywhere the dashboards actually pull data from
 * (both FinancialDashboard and Analytics read from Invoice, not Booking).
 * The money was "collected" but nowhere any report could see it. Now uses
 * the same createCompletionInvoice() helper as /complete, so this cash
 * settlement produces a real, correctly-linked -BAL invoice.
 *
 * Also previously set paymentMethod = 'CASH', which isn't a valid enum
 * value and also silently overwrote the customer's original payment method
 * choice. balanceSettledVia now records HOW the balance was settled
 * without touching the original paymentMethod.
 */
router.post('/:id/record-cash-payment', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    let invoice = null;
    if (booking.balanceAmount > 0 && !booking.balancePaid) {
      invoice = await createCompletionInvoice(booking, { markPaid: true });
    }

    booking.balanceSettledVia = 'cash';
    booking.balancePaid       = true;
    booking.paidAmount        = booking.price;
    booking.balanceAmount     = 0;
    booking.status            = 'completed';
    // FIX (Tier 1.6, C.3a — critical): taskCompletedAt was declared on the
    // schema and queried by utils/serviceReminderScheduler.js's feedback-
    // nudge job, but nothing anywhere ever actually wrote it — so that
    // query matched zero bookings, permanently, and the 3-day nudge could
    // never fire for any booking. Set it at every point status flips to
    // 'completed' (this route, and both branches of /:id/complete below).
    booking.taskCompletedAt   = new Date();
    await booking.save();
    // FIX (Tier 2.2, C.2): see notifyCustomerJobComplete below — this is the
    // third of three places status flips to 'completed'.
    await notifyCustomerJobComplete(req, booking, 0);

    res.json({
      msg: 'Cash payment recorded successfully',
      invoiceNumber: invoice?.invoiceNumber,
      booking,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Sends the "your service is complete" notification to the customer —
 * pulled out into a helper since /complete has two exit points that both
 * need it. FIX (Tier 2.2, C.2 — critical): previously neither exit point
 * notified the customer at all — only the admin room got a socket event
 * ('booking-completed'). JobCompletePage.tsx tells staff "the customer has
 * been notified," which simply wasn't true. Uses Notification.create()
 * directly (not the POST /api/notifications route) since this already runs
 * server-side with the real target userId in hand — no request/response
 * round trip needed, and it sidesteps the exact routing bug fixed in
 * Tier 1.1 entirely.
 */
async function notifyCustomerJobComplete(req, booking, balanceAmount) {
  if (!booking.customerId) return;
  try {
    const message = balanceAmount > 0
      ? `Your ${booking.serviceName || 'service'} is complete. An outstanding balance of Rs. ${balanceAmount.toLocaleString()} is due.`
      : `Your ${booking.serviceName || 'service'} is complete. Thank you for choosing Cloud Laundry.lk!`;

    await Notification.create({
      userId:    booking.customerId.toString(),
      type:      'tracking-update',
      title:     'Service Complete',
      message,
      actionUrl: `/invoice/${booking.bookingId}`,
      bookingId: booking._id,
    });

    const io = req.app.get('socketio');
    if (io) {
      io.to(`user:${booking.customerId}`).emit('notification', {
        type: 'tracking-update', title: 'Service Complete', message,
        actionUrl: `/invoice/${booking.bookingId}`,
      });
    }
  } catch (e) {
    console.warn('Job-complete customer notification failed:', e.message);
  }
}

/**
 * @route   POST /api/bookings/:id/start
 * @desc    C.2 — staff marks a job as started (on-site arrival / work
 *          beginning). Previously nothing ever set this: 'in-progress' was
 *          declared in the schema's status enum but no route anywhere wrote
 *          it, so it was a dead value — bookings jumped straight from
 *          'confirmed' to 'completed' with no tracking step in between, and
 *          customers never got a "your service has started" notification.
 * @access  Private (Staff)
 */
router.post('/:id/start', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ msg: `Cannot start a booking that is already ${booking.status}.` });
    }

    booking.status = 'in-progress';
    booking.taskStartedAt = booking.taskStartedAt || new Date();
    await booking.save();

    if (booking.customerId) {
      const message = `Our team has started work on your ${booking.serviceName || 'service'}.`;
      try {
        await Notification.create({
          userId:    booking.customerId.toString(),
          type:      'tracking-update',
          title:     'Service Started',
          message,
          actionUrl: `/my-bookings`,
          bookingId: booking._id,
        });
        const io = req.app.get('socketio');
        if (io) {
          io.to(`user:${booking.customerId}`).emit('notification', {
            type: 'tracking-update', title: 'Service Started', message, actionUrl: '/my-bookings',
          });
          io.to('admin-room').emit('booking-started', booking);
        }
      } catch (e) {
        console.warn('Job-started customer notification failed:', e.message);
      }
    }

    res.json({ msg: 'Service marked as started.', booking });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/complete
 * @desc    Mark a service as complete and create the completion invoice if
 *          one hasn't already been created (e.g. via record-cash-payment).
 *          Called by JobCompletePage when staff scans the invoice QR code
 *          on-site and taps "Mark Job as Complete".
 * @access  Private (Staff)
 *
 * FIX: Replaced the self-referencing loopback fetch() calls with direct
 *      imports. Calling localhost:4000 from within the same process is fragile
 *      (breaks in Docker, load balancers, different PORT values) and adds
 *      unnecessary network overhead.
 */
router.post('/:id/complete', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // If balance already paid (e.g. cash was recorded on-site already),
    // there's already a correctly-linked invoice for it — just mark complete.
    if (booking.balancePaid || booking.balanceAmount <= 0) {
      booking.status = 'completed';
      // FIX (Tier 1.6, C.3a): see the matching comment on /record-cash-payment.
      booking.taskCompletedAt = new Date();
      await booking.save();
      await notifyCustomerJobComplete(req, booking, 0);
      return res.json({ msg: 'Service marked as complete', booking });
    }

    // Balance is outstanding — create the invoice via the shared helper.
    // markPaid: true for COD (cash collected the moment this is generated,
    // per B.2's "generating the invoice IS the trigger" rule); false for
    // Pay-After-Completion and for a not-yet-settled advance-balance
    // remainder (still owed, invoice goes out SENT/UNPAID).
    const isCod = booking.paymentMethod === 'cod';
    const completionInvoice = await createCompletionInvoice(booking, { markPaid: isCod });

    booking.status = 'completed';
    // FIX (Tier 1.6, C.3a): see the matching comment on /record-cash-payment.
    booking.taskCompletedAt = new Date();
    if (isCod) {
      // Cash was collected the moment this invoice was generated — reflect
      // that on the booking too, so the dashboard flips to PAID immediately.
      booking.paidAmount    = booking.price;
      booking.balanceAmount = 0;
      booking.balancePaid   = true;
    }
    await booking.save();

    // Notify admin in real time that a job was completed
    const io = req.app.get('socketio');
    if (io) io.to('admin-room').emit('booking-completed', booking);
    // FIX (Tier 2.2, C.2): notify the customer too — see notifyCustomerJobComplete.
    await notifyCustomerJobComplete(req, booking, booking.balanceAmount);

    res.json({
      msg: 'Service marked as complete. Invoice created for customer.',
      invoiceNumber: completionInvoice.invoiceNumber,
      balanceAmount: booking.balanceAmount,
      booking,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/request-reschedule
 * @desc    Admin requests the customer reschedule their booking
 * @access  Private
 */
router.post('/:id/request-reschedule', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ msg: 'Booking not found' });

    const io = req.app.get('socketio');
    if (io && booking.customerId) {
      io.to(`user:${booking.customerId}`).emit('notification', {
        type:    'reschedule-request',
        title:   'Reschedule Requested',
        message: reason || 'Please contact us to reschedule your booking.',
        bookingId: booking.bookingId,
      });
    }

    res.json({ msg: 'Reschedule request sent to customer.' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/request-cancel
 * @desc    Admin requests the customer confirm cancellation
 * @access  Private
 */
router.post('/:id/request-cancel', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ msg: 'Booking not found' });

    const io = req.app.get('socketio');
    if (io && booking.customerId) {
      io.to(`user:${booking.customerId}`).emit('notification', {
        type:    'cancel-request',
        title:   'Cancellation Requested',
        message: reason || 'Please confirm if you would like to cancel your booking.',
        bookingId: booking.bookingId,
      });
    }

    res.json({ msg: 'Cancel request sent to customer.' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/decline-reschedule
 * @desc    Customer declines admin reschedule request -> triggers refund if paid online
 * @access  Private
 */
router.post('/:id/decline-reschedule', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id) || await Booking.findOne({ bookingId: req.params.id });

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    booking.status = 'cancelled';
    await booking.save({ validateBeforeSave: false });

    const refundCreated = await triggerRefundIfPaid(booking, 'Customer declined admin reschedule request');

    res.json({
      msg: refundCreated
        ? 'Reschedule declined. Booking cancelled and refund request initiated.'
        : 'Reschedule declined. Booking cancelled.',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/bookings/:id/admin-cancel
 * @desc    Admin cancels a booking directly (no customer confirmation step,
 *          unlike /request-cancel above which only sends a notification).
 *          Triggers the same refund-if-paid logic as customer cancellation.
 * @access  Private (admin/manager only)
 *
 * NEW: previously there was no way for an admin to actually cancel a
 * booking themselves — the only cancel route required
 * booking.customerId === req.user.id, so an admin calling it got a 403.
 */
router.post('/:id/admin-cancel', auth, adminOnly, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return res.status(400).json({ msg: `Booking is already ${booking.status.toLowerCase()}` });
    }

    // A.7 (related fix): admin-cancel previously skipped the
    // service-started check entirely, letting an admin "cancel + refund" a
    // job that was already in progress or finished — which should go
    // through Price Reduction instead. The softer 24-hour cutoff is
    // intentionally NOT enforced here: an admin cancelling on the
    // customer's behalf is exactly the override case that check exists to
    // route around (customer self-service still hits it, via /:id/cancel).
    const eligibility = assessCancellation(booking);
    if (!eligibility.allowed) {
      return res.status(400).json({ msg: eligibility.message });
    }

    booking.status = 'cancelled';
    await booking.save();

    const refundCreated = await triggerRefundIfPaid(booking, reason || 'Booking cancelled by admin');

    res.json({
      msg: refundCreated
        ? 'Booking cancelled by admin and refund request initiated.'
        : 'Booking cancelled by admin.',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

// FIX: module.exports must be at the END of the file.
module.exports = router;
