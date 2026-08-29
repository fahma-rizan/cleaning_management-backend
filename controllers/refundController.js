const Invoice = require('../models/Invoice');
const Refund  = require('../models/Refund');
const {
  sendRefundRequestEmail,
  sendRefundStatusEmail,
} = require('../utils/emailService');
// FIX: emitToUser was called later in this file (approveRefund) but never
// imported — only emitEvent was destructured here. That caused a
// ReferenceError *after* the refund had already succeeded (see the fix
// note on the emitToUser call below).
const { emitEvent, emitToUser } = require('../sockets/socketManager');
// NEW — the payment ledger. See models/Payment.js / utils/paymentLedger.js.
const { recordPayment } = require('../utils/paymentLedger');

// NEW (Tier 3.2) — persists a gateway failure onto the refund document
// itself (status FAILED + the gateway's own message) and broadcasts it over
// the socket to every connected admin, not just the one whose click
// triggered it — see the status enum comment in models/Refund.js and the
// audit finding "Gateway failure isn't persistently flagged."
async function markRefundFailed(refund, reason) {
  try {
    refund.status = 'FAILED';
    refund.failureReason = reason;
    await refund.save();
    emitEvent('refundUpdate', refund);
  } catch (persistErr) {
    // Never let a failure to record the failure mask the original gateway
    // error already being returned to the caller.
    console.warn('Could not persist refund FAILED status:', persistErr.message);
  }
}

// @desc    Get all pending refund requests
// @route   GET /api/refunds
// @access  Private (admin)
exports.getAllRefunds = async (req, res) => {
  try {
    // FIX: This previously hardcoded status: 'PENDING', which silently
    // limited every caller (including the dashboard's "Total Refunds" /
    // "Refund Rate" stats) to pending-only counts — making those numbers
    // wrong for anyone expecting historical totals. Now accepts an optional
    // ?status= query param; with no param, returns ALL refunds (any status)
    // so the dashboard stats are accurate, while admin's pending-review
    // panel can explicitly request ?status=PENDING.
    const query = req.query.status ? { status: req.query.status.toUpperCase() } : {};
    const refunds = await Refund.find(query)
      .populate({ path: 'invoice', model: 'Invoice' })
      .sort({ createdAt: -1 });
    res.json(refunds);
  } catch (error) {
    console.error('Error fetching refund requests:', error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Customer requests a refund for an invoice
// @route   POST /api/refunds/request
// @access  Private
//
// FIX (batch 1): Duplicate refund check now uses status filter so a previously
// REJECTED request can be re-submitted, but PENDING/APPROVED cannot be duplicated.
exports.requestRefund = async (req, res, next) => {
  const { invoiceId, reason } = req.body;

  if (!invoiceId || !reason) {
    return res.status(400).json({ msg: 'Invoice ID and reason are required.' });
  }

  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ msg: `"${invoiceId}" is not a valid invoice ID.` });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ msg: 'Invoice not found.' });
    }

    // A.7: Refund only applies to cancellations BEFORE the service has started.
    const Booking = require('../models/Booking');
    const booking = await Booking.findById(invoice.bookingId)
      .populate({ path: 'customerId', model: 'User' });
    if (!booking) {
      return res.status(404).json({ message: 'Associated booking not found.' });
    }

    const serviceStarted = ['in-progress', 'completed'].includes(booking.status)
      || booking.taskStartedAt;
    if (serviceStarted) {
      return res.status(400).json({
        message: 'This service has already started or been completed. For post-service concerns, please use the Price Reduction page instead.',
      });
    }

    // A.7: Policy cutoff — cancellations must be before service start time.
    const POLICY_CUTOFF_HOURS = parseInt(process.env.CANCELLATION_CUTOFF_HOURS || '24', 10);
    const now = new Date();
    let serviceStart = null;
    if (booking.date) {
      const dateParts = booking.date.split('-').map(Number);
      serviceStart = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      if (booking.time) {
        // FIX: was /(d{1,2}):(d{2})(AM|PM)/i — literal "d", not \d, so this
        // could never match a real time string like "9:00AM". The `if (tm)`
        // branch below was dead code as a result, and the 24-hour cutoff
        // silently ignored the booking's actual time (always fell back to
        // midnight of the service date).
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
        return res.status(400).json({
          message: "We're sorry, but cancellations within 24 hours of the scheduled service are not eligible for automatic refunds. Please contact our customer care team to discuss your options.",
          contactRequired: true,
          contactPhone: process.env.SUPPORT_PHONE || 'info@cloudlaundry.lk',
          contactLink: '/contact',
        });
      }
    }

    // Only block if there is already an active (PENDING or APPROVED) refund
    const existingRefund = await Refund.findOne({
      invoice: invoiceId,
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    if (existingRefund) {
      return res.status(400).json({ msg: 'A refund request is already active for this invoice.' });
    }

    invoice.status = 'REFUND_PENDING';
    // FIX: same recurring issue as price reduction and job-complete routes —
    // legacy/seed invoices may have customer.userId or bookingId stored as
    // plain strings (pre-master-schema data). A full schema re-validation
    // on this status-only update throws a Mongoose ValidationError, which
    // was the actual cause of this 500 — not the refund logic itself.
    await invoice.save({ validateBeforeSave: false });

    const newRefund = new Refund({
      invoice: invoice._id,
      reason,
      status: 'PENDING',
      refundedAmount: invoice.paidAmount,
    });

    await newRefund.save();

    // Email and socket notification failures should never block a refund
    // request that has already succeeded.
    try {
      await sendRefundRequestEmail(invoice, reason);
      emitEvent('refundUpdate', invoice);
    } catch (notifyErr) {
      console.warn('Refund request saved but notification/email failed:', notifyErr.message);
    }

    res.status(201).json(newRefund);
  } catch (error) {
    console.error('Error processing refund request:', error.message);
    if (error.errors) {
      console.error('Validation details:', Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`).join(' | '));
    }
    next(error);
  }
};

// @desc    Admin approves a refund request
// @route   POST /api/refunds/approve/:refundId
// @access  Private (admin)
//
// FIX (batch 1): Previously only updated the DB without ever calling PayHere's
//   refund API — customer money was never returned. Now:
//   1. Gets PayHere OAuth2 access token
//   2. Calls PayHere refund endpoint
//   3. Only marks invoice REFUNDED if PayHere confirms success
//
// FIX (batch 2): PayHere base URL now read from PAYHERE_BASE_URL env var so
//   switching from sandbox to production requires only a .env change, not a
//   code change. Defaults to sandbox if not set.
//
// FIX (batch 2): sendRefundStatusEmail now receives the refund amount as a
//   separate argument. Previously it was called after invoice.paidAmount had
//   already been decremented — so on a full refund the email showed Rs. 0.
exports.approveRefund = async (req, res, next) => {
  try {
    const refund = await Refund.findById(req.params.refundId).populate('invoice');

    if (!refund) {
      return res.status(404).json({ msg: 'Refund request not found.' });
    }

    const invoice = refund.invoice;
    if (!invoice) {
      return res.status(404).json({ msg: 'Associated invoice not found.' });
    }

    const amountRefunded = refund.refundedAmount;

    // FIX: Previously hard-blocked any refund with no payherePaymentId
    // ("process manually" with no actual way to do that from the UI).
    // Now: if the invoice was paid in cash, record the refund directly —
    // there's no online gateway to call since no online payment exists.
    // Only invoices WITH a real PayHere payment go through the gateway API.
    if (invoice.payherePaymentId) {
      const appId     = process.env.PAYHERE_APP_ID;
      const appSecret = process.env.PAYHERE_APP_SECRET;

      if (!appId || !appSecret) {
        return res.status(500).json({ msg: 'Payment gateway config error: PAYHERE_APP_ID/SECRET missing.' });
      }

      // FIX (batch 2): Use env var so sandbox → production is a config change only
      const payhereBase = process.env.PAYHERE_BASE_URL || 'https://sandbox.payhere.lk';

      // Step 1: Get PayHere OAuth2 access token
      const authString = Buffer.from(`${appId}:${appSecret}`).toString('base64');
      const tokenResponse = await fetch(`${payhereBase}/merchant/v1/oauth/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('PayHere token error:', tokenData);
        // NEW (Tier 3.2) — persist the failure so it doesn't just vanish
        // for whichever admin happened to be looking; see the status enum
        // comment in models/Refund.js.
        await markRefundFailed(refund, 'Failed to authenticate with payment gateway.');
        return res.status(502).json({ msg: 'Failed to authenticate with payment gateway.' });
      }

      // Step 2: Call PayHere refund API
      const refundResponse = await fetch(`${payhereBase}/merchant/v1/payment/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_id:  invoice.payherePaymentId,
          description: refund.reason || 'Refund approved by admin',
          amount:      amountRefunded,
        }),
      });

      const refundData = await refundResponse.json();
      if (!refundResponse.ok || refundData.status !== 1) {
        console.error('PayHere refund error:', refundData);
        // NEW (Tier 3.2) — same persistent-flagging fix as the token-failure
        // branch above.
        await markRefundFailed(refund, refundData.msg || 'Refund failed at payment gateway.');
        return res.status(502).json({
          msg:     'Refund failed at payment gateway.',
          details: refundData.msg || refundData,
        });
      }
    }
    // A.7: COD refunds before service are removed — COD means no money was
    //   collected at booking time, so there is nothing to refund pre-service.

    // Step 3: Update DB only after PayHere confirms success
    refund.status = 'APPROVED';
    refund.refundDate = new Date();
    refund.paymentReference = invoice.payherePaymentId || 'N/A';
    // NEW (Tier 3.2) — clear any stale failure message from an earlier
    // failed attempt now that a retry has succeeded.
    refund.failureReason = null;

    invoice.history.push({
      event:     'REFUND_PROCESSED',
      details:   `LKR ${amountRefunded.toFixed(2)} refunded via PayHere. Reason: ${refund.reason}`,
      timestamp: new Date(),
    });
    await invoice.save({ validateBeforeSave: false });

    // NEW — paidAmount/balanceAmount/status used to be hand-decremented
    // right here; now a REFUND ledger entry, recomputed the same way
    // every other payment event on this invoice is. `method` mirrors the
    // branch above: online only when this invoice actually has a real
    // PayHere payment to call the gateway against, cash otherwise (the
    // A.7 comment above already establishes COD has nothing to refund
    // pre-service, so a cash-method refund here only ever means an
    // Advance+Balance/Pay-After-Completion amount collected on-site).
    const updatedInvoice = await recordPayment({
      invoiceId:  invoice._id,
      bookingId:  invoice.bookingId,
      customerId: invoice.customer?.userId,
      amount:     amountRefunded,
      direction:  'REFUND',
      method:     invoice.payherePaymentId ? 'online' : 'cash',
      label:      'Refund approved by admin',
      reference:  invoice.payherePaymentId || undefined,
      note:       refund.reason || undefined,
      recordedBy: req.user?.id,
    });
    // Keep the in-memory `invoice` (used below for the email/notification
    // and the response) in sync with what recompute just derived, rather
    // than the stale pre-refund values it still holds.
    if (updatedInvoice) {
      invoice.paidAmount    = updatedInvoice.paidAmount;
      invoice.balanceAmount = updatedInvoice.balanceAmount;
      invoice.status        = updatedInvoice.status;
    }

    // FIX (batch 2): pass amountRefunded explicitly so the email shows the correct figure
    // FIX: emitToUser moved inside this same try/catch — it used to run
    // after this block, unguarded. With emitToUser previously undefined,
    // that threw a ReferenceError *after* the PayHere refund and invoice
    // save had already succeeded, which bubbled to the outer catch and
    // returned a 500 to the admin even though the refund actually went
    // through (real risk of an admin retrying and double-refunding).
    try {
      sendRefundStatusEmail(invoice, 'approved', '', amountRefunded);
      // FIX (Tier 3.2): this emitted `invoice`, not `refund` — but the only
      // frontend listener (FinancialDashboard.tsx's handleRefundUpdate)
      // matches incoming events against its refunds list by `_id`, and an
      // Invoice document's _id is never equal to a Refund document's _id.
      // Every refund status change has therefore always silently failed to
      // live-update any admin's dashboard except the one who triggered it
      // (which updates its own local state directly, not via the socket
      // round-trip) — exactly the "only the admin who clicked Approve sees
      // it" gap the audit flagged. Emitting the actual refund document
      // (invoice is already populated onto it) fixes the match.
      emitEvent('refundUpdate', refund);
      emitEvent('invoiceUpdate', invoice);
      emitToUser(invoice.customer.userId?.toString(), 'notification', {
        type:      'refund_processed',
        title:     'Refund Processed',
        message:   `Your refund of Rs. ${amountRefunded.toFixed(2)} has been processed successfully.`,
        actionUrl: '/admin/financial-dashboard',
      });
    } catch (notifyErr) {
      console.warn('Refund approved but notification/email failed:', notifyErr.message);
    }

    res.json({ msg: 'Refund processed successfully.', refund, invoiceStatus: invoice.status });
  } catch (error) {
    console.error('Error approving refund:', error.message);
    if (error.errors) {
      console.error('Validation details:', Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`).join(' | '));
    }
    next(error);
  }
};

// @desc    Get full refund details for admin audit trail (A.7)
// @route   GET /api/refunds/details/:refundId
// @access  Private (admin)
//
// FIX: routes/refund.js referenced this handler but it was never actually
// written — `refundController.getRefundDetails` was undefined, which made
// Express throw "argument handler must be a function" while registering
// the route, crashing the server on startup before it could handle *any*
// request. This was blocking, not cosmetic.
exports.getRefundDetails = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.refundId)) {
      return res.status(400).json({ msg: `"${req.params.refundId}" is not a valid refund ID.` });
    }

    const refund = await Refund.findById(req.params.refundId).populate({
      path: 'invoice',
      model: 'Invoice',
      populate: [
        { path: 'bookingId', model: 'Booking' },
        { path: 'customer.userId', model: 'User' },
      ],
    });

    if (!refund) {
      return res.status(404).json({ msg: 'Refund request not found.' });
    }

    res.json(refund);
  } catch (error) {
    console.error('Error fetching refund details:', error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Admin rejects a refund request
// @route   POST /api/refunds/reject/:refundId
// @access  Private (admin)
exports.rejectRefund = async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ msg: 'A rejection reason is required.' });
  }

  try {
    const refund = await Refund.findById(req.params.refundId);
    if (!refund) {
      return res.status(404).json({ msg: 'Refund request not found.' });
    }

    refund.status          = 'REJECTED';
    refund.rejectionReason = reason;
    await refund.save();

    const invoice = await Invoice.findById(refund.invoice);
    if (invoice) {
      invoice.status = 'PAID';
      invoice.history.push({
        event:     'REFUND_REJECTED',
        details:   `Refund rejected by admin. Reason: ${reason}`,
        timestamp: new Date(),
      });
      // FIX: same validateBeforeSave issue as everywhere else in this file
      await invoice.save({ validateBeforeSave: false });

      try {
        sendRefundStatusEmail(invoice, 'rejected', reason);
        // FIX (Tier 3.2): same emitEvent(invoice)→emitEvent(refund) mismatch
        // fixed in approveRefund above — see the comment there. Attach the
        // invoice we already fetched so the emitted refund carries the same
        // populated shape the frontend's Refund list already expects.
        refund.invoice = invoice;
        emitEvent('refundUpdate', refund);
        emitEvent('invoiceUpdate', invoice);
      } catch (notifyErr) {
        console.warn('Refund rejected but notification/email failed:', notifyErr.message);
      }
    }

    res.json(refund);
  } catch (error) {
    console.error('Error rejecting refund:', error.message);
    if (error.errors) {
      console.error('Validation details:', Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`).join(' | '));
    }
    next(error);
  }
};