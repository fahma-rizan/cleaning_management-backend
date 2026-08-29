const Invoice       = require('../models/Invoice');
const Booking       = require('../models/Booking');
const PriceReduction = require('../models/PriceReduction');
const { sendRefundStatusEmail, sendBankDetailsRequestEmail } = require('../utils/emailService');
const { emitEvent, emitToUser } = require('../sockets/socketManager');
// NEW — the payment ledger. See models/Payment.js / utils/paymentLedger.js.
const { recordPayment } = require('../utils/paymentLedger');

// ── Helper: get a fresh PayHere OAuth token ───────────────────────────────
const getPayhereToken = async () => {
  const appId     = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('PAYHERE_APP_ID and PAYHERE_APP_SECRET must be set in .env');
  }
  const authString = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const res = await fetch(`${process.env.PAYHERE_BASE_URL || 'https://sandbox.payhere.lk'}/merchant/v1/oauth/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${authString}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('Failed to get PayHere OAuth token');
  return data.access_token;
};

// @desc    Customer requests a price reduction
// @route   POST /api/price-reductions/request
// @access  Private
exports.requestPriceReduction = async (req, res, next) => {
  try {
    const { invoiceId, requestedAmount, reason, photos } = req.body;

    if (!invoiceId || !requestedAmount || !reason) {
      return res.status(400).json({ msg: 'invoiceId, requestedAmount and reason are required.' });
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ msg: `"${invoiceId}" is not a valid invoice ID.` });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    // Only paid or partial invoices are eligible
    if (!['PAID', 'PARTIAL'].includes(invoice.status)) {
      return res.status(400).json({ msg: `Price reduction can only be requested for paid or partially paid invoices. This invoice is currently ${invoice.status}.` });
    }

    // Requested amount cannot exceed the invoice total
    if (parseFloat(requestedAmount) >= invoice.totalAmount) {
      return res.status(400).json({ msg: `Requested reduction (Rs. ${requestedAmount}) cannot be equal to or greater than the invoice total (Rs. ${invoice.totalAmount}). For a full refund, please use the Refund page.` });
    }

    // Prevent duplicate pending request
    const existing = await PriceReduction.findOne({ invoice: invoiceId, status: 'PENDING' });
    if (existing) {
      return res.status(400).json({ msg: 'A price reduction request is already pending for this invoice.' });
    }

    // FIX (task #19, A.8): auto-populate staffAssigned from the booking so
    // admin can see who worked the job a quality complaint is about, without
    // relying on the customer to name anyone. Previously this field existed
    // on the schema but nothing ever wrote to it.
    let staffAssigned = [];
    if (invoice.bookingId) {
      try {
        const booking = await Booking.findById(invoice.bookingId).select('assignedStaffId assignedStaffName assignedStaffEmail assignedTeam');
        if (booking) {
          if (booking.assignedStaffId || booking.assignedStaffName) {
            staffAssigned.push({
              staffId:    booking.assignedStaffId,
              staffName:  booking.assignedStaffName,
              staffEmail: booking.assignedStaffEmail,
            });
          }
          if (Array.isArray(booking.assignedTeam)) {
            staffAssigned = staffAssigned.concat(
              booking.assignedTeam.map(m => ({ staffId: m.staffId, staffName: m.staffName, staffEmail: m.staffEmail }))
            );
          }
        }
      } catch (lookupErr) {
        console.warn('Could not resolve assigned staff for price reduction:', lookupErr.message);
      }
    }

    // FIX (task #19, A.8): accept customer-submitted evidence photos
    // (data URLs from the frontend's file input) — the schema already had a
    // `photos` array, nothing ever wrote to it.
    const cleanPhotos = Array.isArray(photos)
      ? photos.filter(p => p && typeof p.url === 'string' && p.url.length > 0).slice(0, 5) // cap at 5
      : [];

    const reduction = new PriceReduction({
      invoice: invoice._id,
      requestedAmount: parseFloat(requestedAmount),
      reason,
      photos: cleanPhotos,
      staffAssigned,
    });
    await reduction.save();

    invoice.status = 'REFUND_PENDING';
    invoice.history.push({
      event:     'PRICE_REDUCTION_REQUESTED',
      details:   `Customer requested Rs. ${requestedAmount} price reduction. Reason: ${reason}`,
      timestamp: new Date(),
    });
    // FIX: changed to validateBeforeSave: false — some legacy/seed invoices
    // have customer.userId or bookingId stored as plain strings (pre-master-
    // schema data), and a full re-validation on save() throws a Mongoose
    // ValidationError here even though we're only changing status/history.
    // That ValidationError was the actual cause of the 500 — it happened
    // AFTER the PriceReduction document had already been created above,
    // which is also why a retry then hit the "already pending" 400.
    await invoice.save({ validateBeforeSave: false });

    // Notify admin via socket — never let a notification failure break the
    // actual request, which already succeeded by this point.
    try {
      emitEvent('priceReductionRequest', { invoice, reduction });
    } catch (notifyErr) {
      console.warn('Could not emit priceReductionRequest event:', notifyErr.message);
    }

    res.status(201).json(reduction);
  } catch (err) {
    console.error('Error requesting price reduction:', err.message);
    if (err.errors) {
      console.error('Validation details:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(' | '));
    }
    next(err);
  }
};

// @desc    Get all price reduction requests (admin)
// @route   GET /api/price-reductions
// @access  Private (admin)
exports.getAllReductions = async (req, res) => {
  try {
    const query = req.query.status ? { status: req.query.status.toUpperCase() } : {};
    // FIX: only populated `invoice`, not the Booking behind it — so the
    // admin's "review a price reduction" view had the invoice total and
    // customer, but nothing about the actual job (scheduled date/time,
    // address, service) to check the complaint against. Nested-populates
    // invoice.bookingId now so FinancialDashboard's detail view can show
    // real booking details, not just invoice numbers.
    const reductions = await PriceReduction.find(query)
      .populate({
        path: 'invoice',
        model: 'Invoice',
        populate: { path: 'bookingId', model: 'Booking', select: 'bookingId serviceName serviceType date time address status' },
      })
      .sort({ createdAt: -1 });
    res.json(reductions);
  } catch (err) {
    console.error('Error fetching price reductions:', err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    NEW — fetch a single price reduction (used by the customer-facing
//          bank-details submission page to show what they're confirming).
// @route   GET /api/price-reductions/:id
// @access  Private (the invoice's own customer, or an admin)
exports.getReductionById = async (req, res, next) => {
  try {
    const reduction = await PriceReduction.findById(req.params.id).populate('invoice');
    if (!reduction) return res.status(404).json({ msg: 'Price reduction request not found.' });

    const invoice = reduction.invoice;
    const ownerId = invoice?.customer?.userId?.toString();
    const isOwner = ownerId && req.user?.id && ownerId === req.user.id.toString();
    const isAdmin = ['admin', 'manager'].includes(req.user?.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ msg: 'You are not authorized to view this request.' });
    }

    res.json(reduction);
  } catch (err) {
    console.error('Error fetching price reduction:', err.message);
    next(err);
  }
};

// @desc    Admin approves a price reduction request
// @route   POST /api/price-reductions/approve/:id
// @access  Private (admin)
//
// Logic:
//  - If invoice.paidAmount > 0 (customer already paid some/all):
//      Call PayHere partial refund API for the approvedAmount
//      Reduce invoice.paidAmount and invoice.totalAmount
//  - If invoice.paidAmount === 0 (not paid yet, e.g. COD):
//      Just reduce invoice.totalAmount and invoice.balanceAmount (no PayHere call)
exports.approveReduction = async (req, res, next) => {
  try {
    // CHANGED — bankDetails/manualRefundReason are no longer accepted here.
    // The admin used to hand-type the customer's bank details via a chain
    // of browser prompt()s for the cash-refund case; that's replaced below
    // by emailing the customer a link to submit their own details (see
    // submitBankDetails/completeRefund further down this file).
    const { approvedAmount } = req.body;

    if (!approvedAmount || parseFloat(approvedAmount) <= 0) {
      return res.status(400).json({ msg: 'approvedAmount is required and must be greater than 0.' });
    }

    const reduction = await PriceReduction.findById(req.params.id).populate('invoice');
    if (!reduction) return res.status(404).json({ msg: 'Price reduction request not found.' });

    const invoice = reduction.invoice;
    if (!invoice)  return res.status(404).json({ msg: 'Associated invoice not found.' });

    const amount = parseFloat(parseFloat(approvedAmount).toFixed(2));

    if (amount >= invoice.totalAmount) {
      return res.status(400).json({ msg: 'Approved amount must be less than the invoice total. Use the Refund workflow for full refunds.' });
    }

    let reductionType = 'ADJUSTMENT';
    // NEW — how much of this reduction is an actual refund of money
    // already collected (0 for the "not paid yet" branch below). Recorded
    // to the payment ledger after the shared save further down, instead
    // of hand-decrementing invoice.paidAmount/balanceAmount in each
    // branch — which also incidentally fixes a latent bug: the old code
    // never floored paidAmount at 0, so an approvedAmount close to (or,
    // via a race, briefly exceeding) what was actually paid could drive
    // paidAmount negative; recomputeInvoiceAmounts always floors at 0.
    let refundAmount = 0;
    let refundMethod = null;

    if (invoice.paidAmount > 0 && invoice.payherePaymentId) {
      // Customer paid online via PayHere — issue a partial PayHere refund
      const token = await getPayhereToken();

      const refundRes = await fetch(
        `${process.env.PAYHERE_BASE_URL || 'https://sandbox.payhere.lk'}/merchant/v1/payment/refund`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            payment_id:  invoice.payherePaymentId,
            description: `Price reduction approved. Reason: ${reduction.reason}`,
            amount,
          }),
        }
      );
      const refundData = await refundRes.json();
      if (!refundRes.ok || refundData.status !== 1) {
        return res.status(502).json({ msg: 'Refund failed at payment gateway.', details: refundData.msg || refundData });
      }

      reductionType = 'REFUND';
      refundAmount  = amount;
      refundMethod  = 'online';

      // The invoice's total price itself is being reduced — a price
      // change, not a payment event, so this stays a direct field write.
      // paidAmount/balanceAmount are no longer touched here — the ledger
      // entry recorded below (after the shared save) derives them.
      invoice.totalAmount = parseFloat((invoice.totalAmount - amount).toFixed(2));

    } else if (invoice.paidAmount > 0) {
      // CHANGED (self-service bank details): Customer paid in CASH (no
      // payherePaymentId) — there is no online gateway to call, so the
      // money has to go back via bank transfer. This used to finalize the
      // refund immediately, with the admin hand-typing bank details
      // gathered by phone/email beforehand. Now: record the approved
      // amount, flip the reduction into AWAITING_BANK_DETAILS, and email
      // the customer a link to submit their own bank details — nothing on
      // the Invoice changes yet. completeRefund() (below) does the actual
      // totalAmount reduction + ledger REFUND entry once an admin confirms
      // the transfer was sent, mirroring exactly what this branch used to
      // do inline.
      reduction.approvedAmount         = amount;
      reduction.status                 = 'AWAITING_BANK_DETAILS';
      reduction.bankDetailsRequested   = true;
      reduction.bankDetailsRequestedAt = new Date();
      await reduction.save();

      try {
        await sendBankDetailsRequestEmail(invoice, reduction);
        emitToUser(invoice.customer?.userId?.toString(), 'notification', {
          type:      'payment-reduction-awaiting-bank-details',
          title:     'Price Reduction Approved — Bank Details Needed',
          message:   `Your price reduction of Rs. ${amount} for invoice ${invoice.invoiceNumber} was approved. Please submit your bank details so we can send the refund.`,
          actionUrl: `/refund-bank-details/${reduction._id}`,
        });
        emitEvent('priceReductionUpdate', reduction);
      } catch (notifyErr) {
        console.warn('Price reduction moved to awaiting-bank-details but notification/email failed:', notifyErr.message);
      }

      return res.json({
        msg: 'Price reduction approved. The customer has been emailed to submit their bank details before the refund is sent.',
        reduction,
      });
    } else {
      // Not paid yet — adjust the balance/total downward. Nothing to
      // refund (refundAmount stays 0), so no ledger entry below either.
      invoice.totalAmount   = parseFloat((invoice.totalAmount   - amount).toFixed(2));
      invoice.balanceAmount = parseFloat((invoice.balanceAmount - amount).toFixed(2));
    }

    // Add discount entry to invoice discounts array
    invoice.discounts = invoice.discounts || [];
    invoice.discounts.push({ description: `Price reduction: ${reduction.reason}`, amount });

    invoice.history.push({
      event:     'PRICE_REDUCED',
      details:   `Rs. ${amount} price reduction approved by admin. Type: ${reductionType}. Reason: ${reduction.reason}`,
      timestamp: new Date(),
    });
    // FIX: skip full re-validation — legacy invoices may have string
    // customer.userId/bookingId that fail ObjectId validation even though
    // we're only updating pricing/status/history fields here.
    await invoice.save({ validateBeforeSave: false });

    // NEW — log the refund (if any) to the payment ledger now that
    // totalAmount above has already been saved with its new, reduced
    // value — recomputeInvoiceAmounts reads the invoice fresh, so it
    // derives balanceAmount against the CORRECT (post-reduction) total.
    // This also now sets `status`, replacing the old inline ternary,
    // which never handled the REFUNDED case (fully-refunded-to-zero) at
    // all — recompute's status logic (PAID/PARTIAL/UNPAID/REFUNDED) does.
    let updatedInvoice = invoice;
    if (refundAmount > 0) {
      updatedInvoice = await recordPayment({
        invoiceId:  invoice._id,
        bookingId:  invoice.bookingId,
        customerId: invoice.customer?.userId,
        amount:     refundAmount,
        direction:  'REFUND',
        method:     refundMethod,
        label:      `Price reduction refund (${refundMethod})`,
        note:       reduction.reason,
        recordedBy: req.user?.id,
      }) || invoice;
    }

    // Update reduction record
    reduction.approvedAmount = amount;
    reduction.reductionType  = reductionType;
    reduction.status         = 'APPROVED';
    await reduction.save();

    // Notify customer and send email — never let these fail the approval,
    // which has already succeeded by this point. Uses updatedInvoice (the
    // ledger-derived version) so paidAmount/balanceAmount/status are
    // current, not the pre-refund snapshot.
    try {
      emitToUser(invoice.customer.userId?.toString(), 'notification', {
        type:      'payment-reduction-approved',
        title:     'Price Reduction Approved',
        message:   `Your price reduction of Rs. ${amount} for invoice ${invoice.invoiceNumber} has been approved.`,
        actionUrl: `/invoice/${invoice.bookingId}`,
      });
      await sendRefundStatusEmail(updatedInvoice, 'approved', '', amount);
      emitEvent('priceReductionUpdate', updatedInvoice);
      emitEvent('invoiceUpdate', updatedInvoice);
    } catch (notifyErr) {
      console.warn('Price reduction approved but notification/email failed:', notifyErr.message);
    }

    res.json({ msg: 'Price reduction approved successfully.', reduction, invoice: updatedInvoice });
  } catch (err) {
    console.error('Error approving price reduction:', err.message);
    if (err.errors) {
      console.error('Validation details:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(' | '));
    }
    next(err);
  }
};

// @desc    Admin rejects a price reduction request
// @route   POST /api/price-reductions/reject/:id
// @access  Private (admin)
exports.rejectReduction = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ msg: 'A rejection reason is required.' });

    const reduction = await PriceReduction.findById(req.params.id).populate('invoice');
    if (!reduction) return res.status(404).json({ msg: 'Price reduction request not found.' });

    reduction.status          = 'REJECTED';
    reduction.rejectionReason = reason;
    await reduction.save();

    const invoice = reduction.invoice;
    if (invoice) {
      invoice.status = 'PAID'; // restore previous status
      invoice.history.push({
        event:     'PRICE_REDUCTION_REJECTED',
        details:   `Price reduction rejected by admin. Reason: ${reason}`,
        timestamp: new Date(),
      });
      // FIX: same validateBeforeSave issue as approveReduction — legacy
      // invoices with string customer.userId/bookingId failed full
      // re-validation on a status-only update, causing a 500.
      await invoice.save({ validateBeforeSave: false });

      try {
        emitToUser(invoice.customer.userId?.toString(), 'notification', {
          type:      'complaint-rejected',
          title:     'Price Reduction Request Rejected',
          message:   `Your price reduction request for invoice ${invoice.invoiceNumber} was not approved. Reason: ${reason}`,
          actionUrl: `/invoice/${invoice.bookingId}`,
        });
        emitEvent('priceReductionUpdate', invoice);
      } catch (notifyErr) {
        console.warn('Price reduction rejected but notification failed:', notifyErr.message);
      }
    }

    res.json(reduction);
  } catch (err) {
    console.error('Error rejecting price reduction:', err.message);
    if (err.errors) {
      console.error('Validation details:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(' | '));
    }
    next(err);
  }
};

// @desc    Customer submits their bank details for an approved cash refund
//          (the self-service replacement for the admin's old prompt()s)
// @route   POST /api/price-reductions/:id/bank-details
// @access  Private (the invoice's own customer, or an admin)
// NEW (Tier 4.1): this used to only ever accept bank details. Now accepts
// an explicit `refundMethod` — 'BANK_TRANSFER' (unchanged behavior,
// existing fields) or 'CASH_PICKUP' (no bank fields required; an optional
// note instead). Route/endpoint name kept as-is (routes/priceReduction.js
// already documents this) since RefundBankDetailsPage.tsx already calls it
// and changing the URL is unnecessary churn.
exports.submitBankDetails = async (req, res, next) => {
  try {
    const { refundMethod, accountHolder, bankName, accountNumber, branch, pickupNotes } = req.body;
    const method = refundMethod === 'CASH_PICKUP' ? 'CASH_PICKUP' : 'BANK_TRANSFER';

    if (method === 'BANK_TRANSFER' && (!accountHolder || !bankName || !accountNumber)) {
      return res.status(400).json({ msg: 'Account holder, bank name and account number are required.' });
    }

    const reduction = await PriceReduction.findById(req.params.id).populate('invoice');
    if (!reduction) return res.status(404).json({ msg: 'Price reduction request not found.' });
    if (reduction.status !== 'AWAITING_BANK_DETAILS') {
      return res.status(400).json({ msg: 'This reduction is not currently awaiting a refund method.' });
    }

    const invoice = reduction.invoice;
    if (!invoice) return res.status(404).json({ msg: 'Associated invoice not found.' });

    // Ownership check — only the customer this invoice actually belongs to
    // (or an admin, in case they're doing this on the customer's behalf
    // over the phone) can submit this for it.
    const ownerId = invoice.customer?.userId?.toString();
    const isOwner = ownerId && req.user?.id && ownerId === req.user.id.toString();
    const isAdmin = ['admin', 'manager'].includes(req.user?.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ msg: 'You are not authorized to submit this for this request.' });
    }

    reduction.refundMethod = method;
    if (method === 'BANK_TRANSFER') {
      reduction.bankDetails = {
        accountHolder,
        bankName,
        accountNumber,
        branch: branch || '',
      };
    } else {
      reduction.pickupNotes = pickupNotes || '';
    }
    reduction.bankDetailsSubmittedAt = new Date();
    await reduction.save();

    try {
      emitEvent('priceReductionUpdate', reduction);
      // Lets the admin dashboard flag this as "ready to complete" without a
      // full refetch/poll cycle.
      emitEvent('bankDetailsSubmitted', reduction);
    } catch (notifyErr) {
      console.warn('Bank details saved but notification failed:', notifyErr.message);
    }

    res.json({
      msg: method === 'CASH_PICKUP'
        ? "Got it — you can collect your cash refund in person. Our team will confirm once it's ready."
        : 'Bank details submitted. Our team will process your refund shortly.',
      reduction,
    });
  } catch (err) {
    console.error('Error submitting bank details:', err.message);
    if (err.errors) {
      console.error('Validation details:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(' | '));
    }
    next(err);
  }
};

// @desc    Admin finalizes a cash refund once the customer has responded —
//          either bank details submitted, or an in-person pickup chosen
//          (Tier 4.1) — the deferred second half of what approveReduction's
//          cash branch used to do inline.
// @route   POST /api/price-reductions/:id/complete-refund
// @access  Private (admin)
exports.completeRefund = async (req, res, next) => {
  try {
    const reduction = await PriceReduction.findById(req.params.id).populate('invoice');
    if (!reduction) return res.status(404).json({ msg: 'Price reduction request not found.' });
    if (reduction.status !== 'AWAITING_BANK_DETAILS') {
      return res.status(400).json({ msg: 'This reduction is not awaiting a refund completion.' });
    }
    // NEW (Tier 4.1): a pickup needs no bank details at all — the customer
    // choosing CASH_PICKUP (see submitBankDetails) IS their response.
    // Anything else (BANK_TRANSFER, or a legacy record from before this
    // choice existed) still needs real bank details before this can finalize.
    const isPickup = reduction.refundMethod === 'CASH_PICKUP';
    if (!isPickup && (!reduction.bankDetails?.bankName || !reduction.bankDetails?.accountNumber)) {
      return res.status(400).json({ msg: "The customer hasn't submitted a refund method yet." });
    }

    const invoice = reduction.invoice;
    if (!invoice) return res.status(404).json({ msg: 'Associated invoice not found.' });

    const amount = reduction.approvedAmount;
    const bd     = reduction.bankDetails;

    // Same sequence approveReduction's cash branch used to run inline:
    // reduce the price, log a discount + history entry, then let the
    // ledger derive paidAmount/balanceAmount/status via a REFUND entry.
    invoice.totalAmount = parseFloat((invoice.totalAmount - amount).toFixed(2));
    invoice.discounts = invoice.discounts || [];
    invoice.discounts.push({ description: `Price reduction: ${reduction.reason}`, amount });
    if (isPickup) {
      reduction.manualRefundReason = 'Original payment was cash — refunded via in-person cash pickup.';
      reduction.pickupConfirmedAt  = new Date();
      invoice.history.push({
        event:     'CASH_REFUND_MANUAL',
        details:   `Rs. ${amount} cash refund handed to the customer in person by admin (no online payment to reverse).`,
        timestamp: new Date(),
      });
    } else {
      reduction.manualRefundReason = 'Original payment was cash — no online gateway available, refunded via bank transfer.';
      invoice.history.push({
        event:     'CASH_REFUND_MANUAL',
        details:   `Rs. ${amount} cash refund processed via bank transfer to ${bd.bankName} (a/c ending ${String(bd.accountNumber).slice(-4)}) by admin (no online payment to reverse).`,
        timestamp: new Date(),
      });
    }
    // FIX: skip full re-validation — legacy invoices may have string
    // customer.userId/bookingId that fail ObjectId validation even though
    // we're only updating pricing/status/history fields here.
    await invoice.save({ validateBeforeSave: false });

    const updatedInvoice = await recordPayment({
      invoiceId:  invoice._id,
      bookingId:  invoice.bookingId,
      customerId: invoice.customer?.userId,
      amount,
      direction:  'REFUND',
      method:     'cash',
      label:      isPickup ? 'Price reduction refund (cash, in-person pickup)' : 'Price reduction refund (cash, via bank transfer)',
      note:       reduction.reason,
      recordedBy: req.user?.id,
    }) || invoice;

    reduction.reductionType = 'REFUND';
    reduction.status        = 'APPROVED';
    await reduction.save();

    try {
      emitToUser(invoice.customer?.userId?.toString(), 'notification', {
        type:      'payment-reduction-approved',
        title:     'Refund Sent',
        message:   isPickup
          ? `Your Rs. ${amount} refund for invoice ${invoice.invoiceNumber} has been handed over in person.`
          : `Your Rs. ${amount} refund for invoice ${invoice.invoiceNumber} has been sent via bank transfer.`,
        actionUrl: `/invoice/${invoice.bookingId}`,
      });
      await sendRefundStatusEmail(updatedInvoice, 'approved', '', amount);
      emitEvent('priceReductionUpdate', updatedInvoice);
      emitEvent('invoiceUpdate', updatedInvoice);
    } catch (notifyErr) {
      console.warn('Refund completed but notification/email failed:', notifyErr.message);
    }

    res.json({ msg: 'Refund completed and recorded.', reduction, invoice: updatedInvoice });
  } catch (err) {
    console.error('Error completing refund:', err.message);
    if (err.errors) {
      console.error('Validation details:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(' | '));
    }
    next(err);
  }
};