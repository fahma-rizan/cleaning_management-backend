const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const { determineInvoiceDetails, generateInvoiceNumber } = require('../utils/invoiceUtils');
const { pointsToRupees, maxBurnablePoints } = require('../utils/loyaltyConfig');
const Refund = require('../models/Refund');
const Notification = require('../models/Notification');
const { sendPaymentConfirmationEmail } = require('../utils/emailService');
const payhereService = require('../services/payhereService');
// NEW — the payment ledger. See models/Payment.js / utils/paymentLedger.js.
const { recordPayment } = require('../utils/paymentLedger');

// ── Draft encode/decode helpers ────────────────────────────────────────────
// Nothing is written to our database when a customer starts an online
// checkout (Full Online / Advance+Balance). Instead, the booking draft is
// base64-JSON-encoded into PayHere's `custom_1` field, round-trips through
// PayHere's hosted checkout untouched, and comes back to us in the /notify
// webhook — which is the ONLY place the real Booking + Invoice get created,
// and only when payment actually succeeded.
//
// Caveat: PayHere's custom_1/custom_2 fields are meant for short reference
// strings, not arbitrary payloads — if your service list / address text
// pushes this over what PayHere accepts, split the payload across custom_1
// AND custom_2, or fall back to a short-lived server-side cache keyed by
// checkoutRef instead of embedding the data itself.
const encodeDraft = (draft) => Buffer.from(JSON.stringify(draft)).toString('base64');
const decodeDraft = (encoded) => JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));

// @route   POST api/payhere/generate-hash
// @desc    Generate a PayHere hash for Full Online / Advance+Balance checkout.
//          Takes the booking DRAFT directly from the frontend — no booking
//          is created here, and no bookingId exists yet. The draft is
//          carried through PayHere's own custom_1 field and only turned
//          into a real Booking + Invoice once /notify confirms payment
//          succeeded.
// @access  Public (frontend sends whatever session token it has; tighten to
//          `auth` if you require login before checkout starts)
router.post('/generate-hash', async (req, res) => {
  try {
    const { paymentMethod, draft } = req.body;

    if (!draft || !paymentMethod) {
      return res.status(400).json({ msg: 'Missing booking details or payment method.' });
    }
    if (!['full-online', 'advance-balance'].includes(paymentMethod)) {
      return res.status(400).json({
        msg: "This endpoint only handles 'full-online' and 'advance-balance' checkouts.",
      });
    }

    const {
      customerId, customerName, customerEmail, customerPhone,
      address, serviceName, serviceType, serviceCategory, serviceItems,
      date, time, loyaltyPointsBurn = 0, customerLoyaltyPoints = 0,
    } = draft;

    if (!customerId || !customerEmail || !serviceName || !date || !time || !address) {
      return res.status(400).json({ msg: 'Missing required booking details.' });
    }

    const totalPrice = (serviceItems && serviceItems.length > 0)
      ? serviceItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0)
      : parseFloat(draft.price || 0);

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ msg: 'Invalid amount — must be a positive number.' });
    }

    const isFullPayment = paymentMethod === 'full-online';
    const baseAmount     = isFullPayment ? totalPrice : parseFloat((totalPrice * 0.20).toFixed(2));

    // A.2 Loyalty burn — only reached for full-online/advance-balance,
    // which is already guaranteed by the check above.
    let loyaltyPointsUsed = 0;
    let loyaltyDiscount   = 0;
    if (loyaltyPointsBurn > 0) {
      const maxBurnable  = maxBurnablePoints(customerLoyaltyPoints, baseAmount);
      loyaltyPointsUsed  = Math.min(loyaltyPointsBurn, maxBurnable);
      loyaltyDiscount    = pointsToRupees(loyaltyPointsUsed);
    }

    // This is the amount actually charged via PayHere right now.
    const netAmount = parseFloat((baseAmount - loyaltyDiscount).toFixed(2));

    // One-time correlation token — NOT a bookingId. Nothing exists under it
    // until /notify creates the real booking.
    const checkoutRef = crypto.randomUUID();

    const payloadToCarry = {
      checkoutRef,
      paymentMethod,
      customerId, customerName, customerEmail, customerPhone, address,
      serviceName, serviceType, serviceCategory, serviceItems,
      date, time,
      totalPrice,
      loyaltyPointsUsed,
      loyaltyDiscount,
      paidAmount: netAmount,
    };

    const fullName   = customerName || 'Customer';
    const nameParts  = fullName.trim().split(/\s+/);
    const firstName  = nameParts[0] || 'Customer';
    const lastName   = nameParts.slice(1).join(' ') || 'Customer';
    const serviceDescription = (serviceItems && serviceItems.length > 0)
      ? serviceItems.map(item => item.name).join(', ')
      : serviceName || 'Cleaning Service';

    const payment = {
      sandbox: 'true',
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      return_url:  process.env.PAYHERE_RETURN_URL  || 'http://localhost:3000/payment-success',
      cancel_url:  process.env.PAYHERE_CANCEL_URL   || 'http://localhost:3000/payment-failed',
      notify_url:  process.env.PAYHERE_NOTIFY_URL   || 'http://localhost:4000/api/payhere/notify',
      order_id:    checkoutRef,
      items:       `Booking for ${serviceDescription}`,
      currency:    'LKR',
      amount:      netAmount.toFixed(2),
      first_name:  firstName,
      last_name:   lastName,
      email:       customerEmail,
      phone:       customerPhone || '0771234567',
      address,
      city:        'Colombo',
      country:     'Sri Lanka',
      custom_1:    encodeDraft(payloadToCarry),
    };

    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const hashString = `${payment.merchant_id}${payment.order_id}${payment.amount}${payment.currency}${hashedSecret}`;
    const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    res.json({ payhere_payment: payment, hash, checkoutRef });
  } catch (err) {
    console.error('Error generating PayHere hash:', err.message);
    res.status(500).json({ msg: 'Server error while generating payment hash. Please try again later.' });
  }
});

// @route   POST api/payhere/notify
// @desc    PayHere's server-to-server webhook. This is the ONLY place a
//          Full Online / Advance+Balance Booking and its Invoice are
//          created — only once payment has actually succeeded. Nothing
//          exists in our database for this checkout before this point.
// @access  Public (PayHere calls this directly; verified via md5 signature)
router.post('/notify', async (req, res) => {
  try {
    const {
      order_id: checkoutRef, payment_id, payhere_amount, payhere_currency,
      status_code, md5sig, custom_1,
    } = req.body;

    // 1. Validate signature
    const merchantId     = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret  = process.env.PAYHERE_MERCHANT_SECRET;
    const localMd5sig = crypto.createHash('md5').update(
      `${merchantId}${checkoutRef}${payhere_amount}${payhere_currency}${status_code}${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`
    ).digest('hex').toUpperCase();

    if (localMd5sig !== md5sig) {
      console.error('Invalid PayHere signature');
      return res.status(400).send('Invalid signature');
    }

    // Anything other than a successful payment: there's nothing to create —
    // no booking or invoice ever existed for this checkout attempt, so
    // there's nothing to roll back either. The customer's browser will see
    // this via the polling timeout on /booking/by-ref/:checkoutRef.
    //
    // FIX (Tier 2.3, C.1 — critical): previously this branch just logged and
    // returned — no notification, no email, nothing customer-facing at all.
    // A customer whose payment failed had no idea unless they happened to
    // still be watching the browser tab. The 'payment-failed' template in
    // routes/email.js already existed for exactly this but nothing ever
    // triggered it. custom_1 still carries the draft (customer email/name/
    // amount) even on failure, since PayHere echoes it back regardless of
    // outcome — decode it here just for the notification, without creating
    // anything in the database.
    if (status_code != 2) {
      console.log(`[PayHere notify] Non-success status_code=${status_code} for checkoutRef=${checkoutRef} — nothing created.`);
      try {
        if (custom_1) {
          const failedDraft = decodeDraft(custom_1);
          const { TEMPLATES } = require('./email');
          const { transporter } = require('../utils/emailService');
          const variables = {
            customer_name: failedDraft.customerName || 'Customer',
            booking_id:    checkoutRef,
            amount:        (failedDraft.paidAmount || failedDraft.totalPrice || 0).toLocaleString(),
            failure_reason: 'Payment was declined or cancelled by the payment provider.',
            retry_link:    `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment`,
          };
          if (failedDraft.customerEmail) {
            await transporter.sendMail({
              from:    `"Cloud Laundry.lk" <${process.env.GMAIL_USER}>`,
              to:      failedDraft.customerEmail,
              subject: TEMPLATES['payment-failed'].subject,
              text:    TEMPLATES['payment-failed'].body(variables),
            });
          }
          if (failedDraft.customerId) {
            await Notification.create({
              userId:  failedDraft.customerId,
              type:    'payment-failed',
              title:   'Payment Failed',
              message: `Your payment attempt for ${failedDraft.serviceName || 'your booking'} was not successful. Please try again.`,
              actionUrl: '/payment',
            }).catch(() => {});
          }
        }
      } catch (failNotifyErr) {
        console.warn('[PayHere notify] Failure-path notification failed:', failNotifyErr.message);
      }
      return res.status(200).send('OK');
    }

    // Idempotency: PayHere can retry the same notification. If we already
    // created a booking for this checkoutRef, don't create a second one.
    const existing = await Booking.findOne({ checkoutRef });
    if (existing) {
      return res.status(200).send('OK');
    }

    if (!custom_1) {
      console.error(`[PayHere notify] Missing custom_1 draft payload for checkoutRef=${checkoutRef}`);
      return res.status(400).send('Missing draft payload');
    }

    const draft = decodeDraft(custom_1);
    const {
      paymentMethod, customerId, customerName, customerEmail, customerPhone,
      address, serviceName, serviceType, serviceCategory, serviceItems,
      date, time, totalPrice, loyaltyPointsUsed, loyaltyDiscount, paidAmount,
    } = draft;

    let resolvedCustomerId = customerId;
    if (!mongoose.Types.ObjectId.isValid(resolvedCustomerId)) {
      if (process.env.NODE_ENV !== 'development') {
        return res.status(400).send('A valid customer account is required');
      }
      const demoCustomer = await User.findOne({
        email: customerEmail || 'seed-temp-customer@local',
        role: 'customer',
      });
      if (!demoCustomer) {
        return res.status(400).send('Local demo customer is not configured');
      }
      resolvedCustomerId = demoCustomer._id;
    }

    const isFullPayment = paymentMethod === 'full-online';

    // FIX (see audit): balanceAmount must account for the loyalty discount
    // against the OVERALL total, not just the leg being paid right now —
    // otherwise the discount is silently clawed back at balance-collection
    // time. balanceAmount = totalPrice − loyaltyDiscount − paidAmount.
    const balanceAmount = parseFloat((totalPrice - (loyaltyDiscount || 0) - paidAmount).toFixed(2));

    const newBooking = new Booking({
      checkoutRef,
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
      price:         totalPrice,
      paidAmount,
      balanceAmount,
      paymentMethod, // 'full-online' | 'advance-balance'
      status:        'confirmed', // payment already succeeded by the time this runs
    });

    try {
      await newBooking.save();
    } catch (saveErr) {
      console.warn('[PayHere notify] booking.save() failed, retrying without validation:', saveErr.message);
      await newBooking.save({ validateBeforeSave: false });
    }

    const { prefix, categories } = determineInvoiceDetails(serviceItems);
    const invoiceNumber = await generateInvoiceNumber(prefix);

    const invoice = new Invoice({
      invoiceNumber,
      mainCategories: categories,
      invoiceType: isFullPayment ? 'FULL' : 'ADVANCE',
      bookingId: newBooking._id,
      customer: {
        userId:  resolvedCustomerId,
        name:    customerName || 'Customer',
        email:   customerEmail,
        phone:   customerPhone || 'N/A',
        address,
      },
      serviceItems: serviceItems && serviceItems.length > 0
        ? serviceItems
        : [{ name: serviceName || 'Service', price: totalPrice, quantity: 1 }],
      subTotal:      totalPrice,
      totalAmount:   totalPrice,
      paidAmount,
      balanceAmount,
      loyaltyPointsUsed: loyaltyPointsUsed || 0,
      loyaltyDiscount:   loyaltyDiscount   || 0,
      paymentMethod: isFullPayment ? 'Full Online' : 'Advance + Balance',
      payherePaymentId: payment_id,
      status: isFullPayment ? 'PAID' : 'PARTIAL',
      history: [{
        event:     'PAYMENT_RECEIVED',
        details:   `LKR ${parseFloat(payhere_amount).toFixed(2)} received via PayHere. Payment ID: ${payment_id}`,
        timestamp: new Date(),
      }],
    });

    await invoice.save();

    // NEW — log the confirmed online payment to the ledger. This is the
    // ONLY place this booking/invoice pair is ever created (see the
    // file-level comment at the top), so `paidAmount` here is always a
    // genuinely new charge, never a re-confirmation of one already logged.
    if (paidAmount > 0) {
      await recordPayment({
        invoiceId:  invoice._id,
        bookingId:  newBooking._id,
        customerId: resolvedCustomerId,
        amount:     paidAmount,
        direction:  'CHARGE',
        method:     'online',
        label:      isFullPayment ? 'Full online payment' : 'Advance payment (online)',
        reference:  payment_id,
      });
    }

    // Notify admin via Socket.IO
    const io = req.app.get('socketio');
    if (io) io.to('admin-room').emit('payment-update', invoice);

    // Notify the customer
    if (customerId) {
      const notification = new Notification({
        userId:    customerId.toString(),
        type:      'payment',
        title:     'Payment Successful',
        message:   `Your payment of LKR ${parseFloat(payhere_amount).toFixed(2)} for booking ${newBooking.bookingId} was successful.`,
        actionUrl: `/invoice/${newBooking.bookingId}`,
        bookingId: newBooking.bookingId,
      });
      await notification.save().catch((e) => console.warn('Notification save failed:', e.message));

      await sendPaymentConfirmationEmail(invoice).catch((e) =>
        console.warn('Payment confirmation email failed:', e.message)
      );
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('PayHere Notify Error:', err);
    res.status(500).json({ msg: 'Server error while processing payment notification.' });
  }
});

// @route   POST api/payhere/refund
// @desc    Refund a specific amount via PayHere API
// @access  Private
router.post('/refund', async (req, res) => {
  try {
    const { bookingId, amount, description } = req.body;

    if (!bookingId || !amount) {
      return res.status(400).json({ msg: 'Please provide bookingId and amount' });
    }

    // 1. Fetch Invoice
    const invoice = await Invoice.findOne({ bookingId });
    if (!invoice || !invoice.payherePaymentId) {
      return res.status(404).json({ msg: 'Invoice not found or no PayHere payment ID associated' });
    }

    // 6. Validate refund amount
    if (parseFloat(amount) > invoice.paidAmount) {
      return res.status(400).json({ msg: `Refund amount (LKR ${amount}) cannot exceed the paid amount (LKR ${invoice.paidAmount})` });
    }

    const appId = process.env.PAYHERE_APP_ID;
    const appSecret = process.env.PAYHERE_APP_SECRET;

    if (!appId || !appSecret) {
      console.error('PayHere App ID or Secret is missing in .env');
      return res.status(500).json({ msg: 'Payment gateway configuration error. App ID and Secret required.' });
    }

    // 2. Get Access Token from PayHere
    const authString = Buffer.from(`${appId}:${appSecret}`).toString('base64');

    const tokenResponse = await fetch('https://sandbox.payhere.lk/merchant/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Error fetching PayHere token:', tokenData);
      return res.status(500).json({ msg: 'Failed to authenticate with payment gateway' });
    }

    const accessToken = tokenData.access_token;

    // 3. Initiate Refund
    const refundResponse = await fetch('https://sandbox.payhere.lk/merchant/v1/payment/refund', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment_id: invoice.payherePaymentId,
        description: description || 'Refund',
        amount: parseFloat(amount)
      })
    });

    const refundData = await refundResponse.json();

    if (!refundResponse.ok || refundData.status !== 1) {
      console.error('PayHere Refund Error:', refundData);
      return res.status(400).json({ msg: 'Refund failed at payment gateway', details: refundData.msg || refundData });
    }

    // 4. Update Database
    // NEW: paidAmount/balanceAmount/status used to be hand-decremented
    // right here — replaced with a payment-ledger REFUND entry, so this
    // invoice's numbers are derived the same way every other payment
    // event on it is, instead of one more separate piece of arithmetic.
    // FLAGGED BEHAVIOR CHANGE: the old code only ever set status to
    // REFUNDED when paidAmount hit exactly 0 — a partial refund silently
    // left status at PAID/PARTIAL unchanged, even though less than the
    // full total was actually paid anymore. recomputeInvoiceAmounts (see
    // utils/paymentLedger.js) now sets PARTIAL for that case instead,
    // which is more accurate but IS a visible behavior difference —
    // worth knowing if anything downstream specifically expected the old
    // "stays PAID after a partial refund" quirk.
    const refundAmount = parseFloat(amount);

    invoice.history.push({
      event: 'REFUND_PROCESSED',
      details: `LKR ${refundAmount.toFixed(2)} refunded via PayHere. Reason: ${description || 'N/A'}`,
      timestamp: new Date(),
    });
    await invoice.save({ validateBeforeSave: false });

    const updatedInvoice = await recordPayment({
      invoiceId:  invoice._id,
      bookingId:  invoice.bookingId,
      amount:     refundAmount,
      direction:  'REFUND',
      method:     'online',
      label:      'PayHere refund',
      reference:  invoice.payherePaymentId,
      note:       description || undefined,
    });

    // 5. Create a record in the Refunds collection for tracking
    const newRefund = new Refund({
      invoice: invoice._id,
      reason: description || 'Refund processed by admin',
      status: 'APPROVED', // Directly approved as it's an admin action
      refundedAmount: refundAmount,
    });
    await newRefund.save();

    res.json({
      msg: 'Refund processed successfully',
      refundedAmount: amount,
      invoiceStatus: updatedInvoice?.status || invoice.status,
    });

  } catch (err) {
    console.error('PayHere Refund Error:', err.message);
    res.status(500).json({ msg: 'Server error during the refund process.' });
  }
});

// ── A.3 Advance+Balance online balance payment ─────────────────────────────
// FIX (task #20): this sub-flow was entirely stubbed. generatePaymentLink and
// payBalance existed in invoiceController.js but nothing on the frontend
// called them, the reminder email pointed customers at a link
// (?bookingId=...) neither of the two link generators actually agreed on and
// that embedded a raw unpopulated Mongo ObjectId as "Booking ID", and
// BalancePaymentPage.tsx just faked a 2.5s "processing" delay and created a
// brand-new, unlinked invoice via a bare POST /invoices — reproducing the
// exact invoice double-counting bug the A.4/B.1 fix (createCompletionInvoice)
// solved for the COD/pay-after-completion side. This build follows the same
// "browser-only until webhook confirms" pattern already used for new bookings
// above (/generate-hash + /notify), except here there's no new Booking or
// Invoice to create — the existing advance invoice's own paidAmount/
// balanceAmount are updated directly, so there's nothing to double-count.

// @route   GET /api/payhere/balance-info/:invoiceId
// @desc    Details needed to render the balance-payment page (and to re-poll
//          for completion after returning from PayHere checkout).
// @access  Private
router.get('/balance-info/:invoiceId', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invoiceId)) {
      return res.status(400).json({ msg: 'Invalid invoice reference.' });
    }
    const invoice = await Invoice.findById(req.params.invoiceId).populate('bookingId', 'bookingId');
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    res.json({
      invoiceId:      invoice._id,
      invoiceNumber:  invoice.invoiceNumber,
      // FIX: same readable-bookingId issue fixed elsewhere in the app —
      // invoice.bookingId is an ObjectId ref, not the human "BK-..." string.
      bookingId:      invoice.bookingId?.bookingId || invoice.bookingId,
      serviceType:    invoice.serviceItems?.[0]?.name || 'Cleaning Service',
      totalAmount:    invoice.totalAmount,
      paidAmount:     invoice.paidAmount,
      balanceAmount:  invoice.balanceAmount,
      status:         invoice.status,
      customerName:   invoice.customer?.name || '',
    });
  } catch (err) {
    console.error('Error fetching balance payment info:', err.message);
    res.status(500).json({ msg: 'Could not load balance payment details.' });
  }
});

// @route   POST /api/payhere/generate-balance-hash
// @desc    Generate a PayHere hash to collect the outstanding balance on an
//          existing invoice (Advance+Balance online flow).
// @access  Private
router.post('/generate-balance-hash', auth, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ msg: 'A valid invoiceId is required.' });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });
    if (!(invoice.balanceAmount > 0)) {
      return res.status(400).json({ msg: 'This invoice has no outstanding balance to pay.' });
    }

    // Charge the outstanding balance, not the invoice's historical
    // paidAmount — generateCheckoutData charges whatever is in `paidAmount`
    // on the object it's given, so this override is what makes it charge
    // the right amount without touching the actual DB record.
    const payhereData = payhereService.generateCheckoutData({
      ...invoice.toObject(),
      paidAmount: invoice.balanceAmount,
    });

    res.json({ payhere_payment: payhereData, hash: payhereData.hash, invoiceNumber: invoice.invoiceNumber });
  } catch (err) {
    console.error('Error generating balance payment hash:', err.message);
    res.status(500).json({ msg: 'Could not start balance payment. Please try again later.' });
  }
});

// @route   POST /api/payhere/balance-notify
// @desc    PayHere's server-to-server webhook for the balance payment. The
//          ONLY place a successful balance payment is actually applied to
//          the invoice — mirrors /notify's "webhook is the source of truth"
//          rule, just updating an existing invoice instead of creating one.
// @access  Public (PayHere calls this directly; verified via md5 signature)
router.post('/balance-notify', async (req, res) => {
  try {
    const {
      order_id: invoiceNumber, payment_id, payhere_amount, status_code,
    } = req.body;

    if (!payhereService.validateIpnSignature(req.body)) {
      console.error('[PayHere balance-notify] Invalid MD5 signature.');
      return res.status(400).send('Invalid signature');
    }

    const invoice = await Invoice.findOne({ invoiceNumber });
    if (!invoice) {
      console.error(`[PayHere balance-notify] Invoice not found: ${invoiceNumber}`);
      return res.status(404).send('Invoice not found');
    }

    // Idempotency — PayHere can retry the same notification, and there's no
    // balance left to apply a second time once it's already been paid off.
    if (!(invoice.balanceAmount > 0)) {
      return res.status(200).send('OK');
    }

    if (parseInt(status_code) === 2) {
      const amountPaid = parseFloat(payhere_amount) || 0;

      invoice.payherePaymentId = payment_id;
      invoice.history.push({
        event:     'BALANCE_PAYMENT_RECEIVED',
        details:   `LKR ${amountPaid.toFixed(2)} balance payment received via PayHere. Payment ID: ${payment_id}`,
        timestamp: new Date(),
      });
      await invoice.save({ validateBeforeSave: false });

      // NEW — paidAmount/balanceAmount/status used to be hand-incremented
      // right here (additively, since this webhook adds the balance
      // payment onto the SAME invoice rather than a linked -BAL invoice —
      // unlike the manual staff flow in controllers/invoiceController.js).
      // recordPayment's recompute sums the full ledger instead, which
      // naturally includes the earlier advance charge already logged by
      // the /notify webhook above — same additive result, just derived
      // rather than hand-added.
      const updatedInvoice = await recordPayment({
        invoiceId:  invoice._id,
        bookingId:  invoice.bookingId,
        customerId: invoice.customer?.userId,
        amount:     amountPaid,
        direction:  'CHARGE',
        method:     'online',
        label:      'Advance+Balance settlement (online)',
        reference:  payment_id,
      });

      // FIX (long-flagged gap, closed here): unlike the cash-settlement path
      // in controllers/invoiceController.js's createBalanceInvoice (which
      // syncs Booking.paidAmount/balanceAmount/balancePaid right after its
      // own recordPayment call), this webhook never touched the Booking
      // document at all — only the Invoice. AdminBookings.tsx and
      // StaffDashboard.tsx both read those fields directly off Booking, not
      // Invoice, so an online balance settlement was invisible on both
      // screens even though the Invoice/Payment ledger was already correct.
      // Mirrors the same sync, without forcing booking.status — unlike the
      // cash path (which IS the "job done" trigger), this fires whenever the
      // customer happens to pay online, which may be before or after the job
      // itself was already marked complete elsewhere.
      try {
        const booking = await Booking.findById(invoice.bookingId);
        if (booking) {
          booking.paidAmount    = (booking.paidAmount || 0) + amountPaid;
          booking.balanceAmount = 0;
          booking.balancePaid   = true;
          await booking.save({ validateBeforeSave: false });
        }
      } catch (syncErr) {
        console.warn('[PayHere balance-notify] Booking sync failed:', syncErr.message);
      }

      const io = req.app.get('socketio');
      if (io) io.to('admin-room').emit('payment-update', updatedInvoice || invoice);

      if (invoice.customer?.userId) {
        const notification = new Notification({
          userId:    invoice.customer.userId.toString(),
          type:      'payment',
          title:     'Balance Payment Received',
          message:   `Your balance payment of LKR ${amountPaid.toFixed(2)} for invoice ${invoice.invoiceNumber} was successful. Your booking is now fully paid.`,
          actionUrl: `/invoice/${invoice.bookingId}`,
        });
        await notification.save().catch((e) => console.warn('Notification save failed:', e.message));
      }
      await sendPaymentConfirmationEmail(updatedInvoice || invoice).catch((e) =>
        console.warn('Balance payment confirmation email failed:', e.message)
      );
    } else {
      console.log(`[PayHere balance-notify] Non-success status_code=${status_code} for invoice=${invoiceNumber} — balance left unchanged.`);
      invoice.history.push({
        event:     'BALANCE_PAYMENT_FAILED',
        details:   `PayHere returned status_code ${status_code} for a balance payment attempt. Payment ID: ${payment_id || 'N/A'}`,
        timestamp: new Date(),
      });
      await invoice.save();
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[PayHere balance-notify] Error:', err);
    res.status(500).json({ msg: 'Server error while processing balance payment notification.' });
  }
});

module.exports = router;
