const mongoose       = require('mongoose');
const Invoice       = require('../models/Invoice');
const Booking       = require('../models/Booking');
const Notification  = require('../models/Notification');
const Counter       = require('../models/Counter');
const { determineInvoiceDetails, generateInvoiceNumber } = require('../utils/invoiceUtils');
const { sendInvoiceEmail, sendBalanceReminderEmail } = require('../utils/emailService');
const PaymentReminder = require('../models/PaymentReminder');
const { emitEvent, emitToUser } = require('../sockets/socketManager');
// NEW — the payment ledger. See models/Payment.js and utils/paymentLedger.js
// for the full "why": Invoice.paidAmount/balanceAmount are now derived by
// summing Payment records instead of being hand-set/incremented in place
// at each of these call sites.
const { recordPayment } = require('../utils/paymentLedger');
// NOTE: getInvoicePrefillData / createBalanceInvoice below use this
// module-level `mongoose`. createInvoice() further down still has its own
// local `const mongoose = require('mongoose');` — harmless shadowing, left
// as-is rather than touching working code for an unrelated cleanup.

// REMOVED (task #16): createPayhereCheckout, handlePayhereIPN, handlePayhereReturn,
// and handlePayhereCancel used to live here. They were a second, unused PayHere
// integration attempt — the real online-checkout flow the frontend actually
// calls is routes/payhere.js (generate-hash / notify / refund), built later as
// part of the "browser-only until webhook confirms payment" rework. These four
// were never called by the frontend (createPayhereCheckout/handlePayhereIPN were
// mounted at POST /api/invoice/payhere and /payhere/ipn but nothing pointed at
// them; handlePayhereReturn/handlePayhereCancel weren't even mounted in
// routes/invoice.js) and still carried the original loyalty-discount bug this
// project's audit flagged (balanceAmount not accounting for the discount).
// Removed rather than fixed, since keeping two parallel, drifting
// implementations of the same checkout logic is itself the hazard —
// routes/payhere.js is the one source of truth now. Corresponding route mounts
// removed from routes/invoice.js.

// ── getAllInvoices ─────────────────────────────────────────────────────────
exports.getAllInvoices = async (req, res) => {
  try {
    // FIX: Same issue found in getInvoiceByBookingId and sendInvoiceEmail —
    // invoice.bookingId is an ObjectId reference, not a readable string.
    // Every page that lists invoices (Financial Dashboard, Refund workflow,
    // Price Reduction workflow) was showing raw MongoDB ObjectIds like
    // "69e842eb29d76db14dd39b48" instead of "BK-MANUAL-...". Populating
    // here, at the single shared source, fixes it everywhere at once
    // instead of patching each frontend page separately.
    //
    // ALSO FIX: populate date/time/status too — the Invoice schema has no
    // scheduled-service-date field at all, only the linked Booking does.
    // RefundWorkflow's 24-hour cancellation eligibility check was comparing
    // against invoice.createdAt (when the invoice record was made) instead
    // of the actual scheduled service date, making every invoice older
    // than the booking itself permanently "ineligible" for refund — every
    // row showed the "Within 24hrs — not eligible" badge regardless of
    // when the real service was scheduled.
    const invoices = await Invoice.find()
      .sort({ createdAt: -1 })
      .populate('bookingId', 'bookingId date time status');

    const invoicesWithReadableBookingId = invoices.map(inv => {
      const obj = inv.toObject();
      const bookingDoc = inv.bookingId;
      obj.bookingId     = bookingDoc?.bookingId || inv.bookingId;
      obj.serviceDate   = bookingDoc?.date  || null;
      obj.serviceTime   = bookingDoc?.time  || null;
      obj.bookingStatus = bookingDoc?.status || null;
      return obj;
    });

    res.json(invoicesWithReadableBookingId);
  } catch (error) {
    console.error('Error fetching invoices:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── getInvoiceByNumber ────────────────────────────────────────────────────
exports.getInvoiceByNumber = async (req, res) => {
  try {
    // FIX: same readable-bookingId issue — populate before sending so
    // StaffInvoiceViewer shows "BK-MANUAL-..." instead of a raw ObjectId.
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber })
      .populate('bookingId', 'bookingId');
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

    const invoiceObj = invoice.toObject();
    invoiceObj.bookingId = invoice.bookingId?.bookingId || invoice.bookingId;

    res.json(invoiceObj);
  } catch (error) {
    console.error('Error fetching invoice:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── getInvoiceById ────────────────────────────────────────────────────────
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice by ID:', error.message);
    if (error.kind === 'ObjectId') return res.status(404).json({ msg: 'Invoice not found' });
    res.status(500).send('Server Error');
  }
};

// ── getInvoiceByBookingId ─────────────────────────────────────────────────
exports.getInvoiceByBookingId = async (req, res) => {
  try {
    // bookingId on Invoice is an ObjectId ref:'Booking' (master schema), but
    // every frontend caller (BookingCard, Invoice.tsx, ...) links here with
    // the human-readable "BK-..." string, not the Mongo _id — the old
    // ObjectId-only lookup (with a fallback matching a field that was never
    // the real schema) 404'd on every real call. Resolve the Booking first,
    // accepting either form, then find its invoice.
    const mongoose = require('mongoose');
    const param = req.params.bookingId;

    let booking = mongoose.Types.ObjectId.isValid(param)
      ? await Booking.findById(param)
      : null;
    if (!booking) {
      booking = await Booking.findOne({ bookingId: param });
    }
    if (!booking) return res.status(404).json({ msg: 'Invoice not found' });

    const invoice = await Invoice.findOne({ bookingId: booking._id })
      .populate('bookingId', 'bookingId'); // populate so the readable BK- string is available
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

    // FIX: swap the populated ObjectId for its readable bookingId string
    // before sending to the frontend, so the customer never sees a raw
    // MongoDB ObjectId on their invoice.
    const invoiceObj = invoice.toObject();
    invoiceObj.bookingId = invoice.bookingId?.bookingId || invoice.bookingId;

    res.json(invoiceObj);
  } catch (error) {
    console.error('Error fetching invoice by bookingId:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── getInvoicesByUserId ───────────────────────────────────────────────────
exports.getInvoicesByUserId = async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ msg: 'Forbidden: cannot access another user\'s invoices.' });
    }
    const mongoose = require('mongoose');
    const invoices = await Invoice.find({
      'customer.userId': new mongoose.Types.ObjectId(req.params.userId)
    }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices by userId:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── updateInvoiceStatus ───────────────────────────────────────────────────
exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    console.error('Error updating invoice status:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── sendInvoiceEmail ──────────────────────────────────────────────────────
exports.sendInvoiceEmail = async (req, res) => {
  try {
    // FIX: populate the booking reference so the email shows the readable
    // "BK-..." string instead of a raw MongoDB ObjectId. Without populate(),
    // invoice.bookingId is just an ObjectId — meaningless to a customer.
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber })
      .populate('bookingId', 'bookingId');
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

    // Build a plain object with the human-readable booking ID swapped in
    // for the email template, without mutating the saved document.
    const invoiceForEmail = invoice.toObject();
    invoiceForEmail.bookingId = invoice.bookingId?.bookingId || invoice.bookingId;

    await sendInvoiceEmail(invoice.customer.email, invoiceForEmail);
    res.json({ msg: `Invoice ${invoice.invoiceNumber} sent to ${invoice.customer.email}` });
  } catch (error) {
    console.error('Error sending invoice email:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── createInvoice (staff manual) ─────────────────────────────────────────
// FIX: Maps pricing.discount → discounts[] array so discounts are actually
//      saved to MongoDB. Previously the discount was displayed on the PDF
//      but silently dropped from the database record.
exports.createInvoice = async (req, res, next) => {
  try {
    const {
      invoiceType, bookingId, customer,
      serviceItems, customizationItems,
      pricing, payment, createdByStaff,
      serviceDate, serviceTime, serviceAddress,
    } = req.body;

    if (!bookingId || !customer || !serviceItems || !pricing) {
      return res.status(400).json({ msg: 'Missing required fields.' });
    }

    const { prefix, categories } = determineInvoiceDetails(serviceItems);
    const invoiceNumber = await generateInvoiceNumber(prefix);

    const discountAmount = parseFloat(pricing.discount || 0);
    const discounts = discountAmount > 0
      ? [{ description: 'Staff discount', amount: discountAmount }]
      : [];

    const subTotal    = parseFloat(pricing.basePrice || 0);
    const totalAmount = parseFloat((subTotal - discountAmount).toFixed(2));
    const paidAmount  = parseFloat(payment?.paidAmount  || 0);
    const balanceAmount = parseFloat((totalAmount - paidAmount).toFixed(2));

    // FIX: bookingId on Invoice is an ObjectId ref:'Booking' — but manual
    // staff invoices (created via StaffInvoicePage) have no real Booking
    // document, only a placeholder string like "BK-MANUAL-...". Saving that
    // string directly fails Mongoose validation with a 500 error.
    //
    // Fix: if bookingId isn't a valid existing Booking, create a minimal
    // Booking document right here so the Invoice can reference a real
    // ObjectId. This also keeps the data model consistent — every invoice
    // always traces back to an actual booking record.
    const mongoose = require('mongoose');
    const User = require('../models/User');
    let bookingObjectId;

    const isValidObjectId = mongoose.Types.ObjectId.isValid(bookingId) &&
      (await Booking.exists({ _id: bookingId }));

    if (isValidObjectId) {
      bookingObjectId = bookingId;
    } else {
      // FIX: Booking.customerId is a REQUIRED ObjectId ref to User.
      // Manual staff invoices have a customer name/email/phone but no real
      // registered User account. Find an existing User by email, or create
      // a lightweight walk-in customer record so the Booking can be saved.
      let customerUser = await User.findOne({ email: customer.email });

      if (!customerUser) {
        const [firstName, ...rest] = (customer.name || 'Walk-in Customer').split(' ');
        customerUser = await User.create({
          firstName:  firstName || 'Walk-in',
          lastName:   rest.join(' ') || 'Customer',
          email:      customer.email,
          phone:      customer.phone || '0000000000',
          // Random unusable password — this is a staff-created walk-in
          // record, not a real login account. They never authenticate.
          password:   require('crypto').randomBytes(16).toString('hex'),
          role:       'customer',
          isVerified: true,
          isActive:   true,
        });
      }

      const newBooking = await Booking.create({
        bookingId:     bookingId, // keep the human-readable BK-... string on the Booking itself
        customerId:    customerUser._id,
        customerName:  customer.name,
        email:         customer.email,
        serviceName:   serviceItems[0]?.name || 'Manual Service',
        serviceItems:  serviceItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity || 1 })),
        date:          serviceDate || new Date().toISOString().split('T')[0],
        time:          serviceTime || new Date().toLocaleTimeString(),
        address:       serviceAddress || customer.address || 'N/A',
        price:         totalAmount,
        paidAmount,
        balanceAmount,
        status:        payment?.status === 'PAID' ? 'completed' : 'confirmed',
        // Booking.paymentMethod only accepts ['full-online', 'advance-balance',
        // 'cod', 'pay-after-completion'] — 'cash'/'online' (what this used to
        // send) aren't in that enum, so every walk-in invoice failed to save
        // with a 400 unless the staff-picked method happened to contain 'cod'.
        paymentMethod: payment?.method?.toLowerCase().includes('cod') ? 'cod'
                      : payment?.method?.toLowerCase().includes('cash') ? 'cod' : 'full-online',
      });
      bookingObjectId = newBooking._id;
    }

    const newInvoice = new Invoice({
      invoiceNumber,
      mainCategories: categories,
      invoiceType:    invoiceType || 'FULL',
      bookingId:      bookingObjectId,
      customer,
      serviceItems,
      customizationItems: customizationItems || [],
      discounts,
      subTotal,
      totalAmount,
      paidAmount,
      balanceAmount:  Math.max(0, balanceAmount),
      // APPROVAL FLOW: Staff-created invoices always start as DRAFT.
      // An admin must approve before the invoice is sent to the customer.
      // PayHere online payments bypass this — their status is set by the IPN webhook.
      status: 'DRAFT',
    });

    await newInvoice.save();

    // NEW — log this walk-in invoice's already-collected amount (if any)
    // to the payment ledger. Status stays DRAFT regardless (recompute
    // only auto-adjusts PAID/PARTIAL/UNPAID/REFUNDED), matching the
    // existing approval-flow behavior exactly.
    if (paidAmount > 0) {
      const rawMethod = (payment?.method || '').toLowerCase();
      await recordPayment({
        invoiceId:  newInvoice._id,
        bookingId:  bookingObjectId,
        customerId: customer?.userId,
        amount:     paidAmount,
        direction:  'CHARGE',
        method:     rawMethod.includes('cash') ? 'cash' : rawMethod.includes('cod') ? 'cod' : 'online',
        label:      'Walk-in invoice — amount collected at creation',
        recordedBy: createdByStaff,
      });
    }

    // Notify admin via Socket.IO (real-time badge update on the dashboard)
    emitEvent('invoiceApprovalNeeded', {
      invoiceId:     newInvoice._id,
      invoiceNumber: newInvoice.invoiceNumber,
      customerName:  customer.name,
      totalAmount,
      createdByStaff,
    });

    // Save a persistent notification to DB so admin sees it even after refresh.
    // Uses ADMIN_USER_ID env var — set this to your admin account's MongoDB _id.
    //
    // FIX: ADMIN_USER_ID can be unset, empty, or still contain the literal
    // placeholder text "<your admin account's MongoDB _id>" if someone
    // forgot to replace it in .env. Previously any non-empty string was
    // passed straight to Notification.create() and Mongoose would throw a
    // validation error trying to cast it to ObjectId — crashing the entire
    // invoice creation even though the invoice itself saved fine.
    // Now: validate it's a real ObjectId first, and never let a notification
    // failure block the actual invoice response.
    const adminUserId = process.env.ADMIN_USER_ID;
    const isValidAdminId = adminUserId && mongoose.Types.ObjectId.isValid(adminUserId);

    if (isValidAdminId) {
      try {
        await Notification.create({
          userId:    adminUserId,
          type:      'invoice-approval',
          title:     'Invoice Awaiting Approval',
          message:   `Invoice ${newInvoice.invoiceNumber} for ${customer.name} (Rs. ${totalAmount.toLocaleString()}) was created by staff and needs your approval.`,
          actionUrl: `/staff-invoice/${newInvoice.invoiceNumber}`,
          bookingId: newInvoice.bookingId,
        });
      } catch (notifErr) {
        // Never let a failed admin notification block the invoice response —
        // the invoice already saved successfully above.
        console.warn('Could not save admin approval notification:', notifErr.message);
      }
    } else if (adminUserId) {
      console.warn(
        `ADMIN_USER_ID in .env is not a valid MongoDB ObjectId: "${adminUserId}". ` +
        `Skipping admin notification. Set a real 24-character hex ID from your users collection.`
      );
    }

    res.status(201).json(newInvoice);
  } catch (error) {
    // FIX: Log the FULL error (including Mongoose validation details) so
    // failures are debuggable instead of a generic "Server Error" string.
    console.error('Error creating invoice:', error.message);
    if (error.errors) {
      console.error('Validation details:', Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`).join(' | '));
    }
    next(error); // let the centralised errorHandler format Mongoose validation errors properly
  }
};

// ── small helpers shared by the two functions below ─────────────────────────
const bookingCustomer = (booking) => ({
  name:    booking.customerName || 'Customer',
  email:   booking.customerEmail || booking.email || 'no-reply@cloudlaundry.lk',
  phone:   booking.phone || '',
  address: booking.address || '',
});

const bookingServiceItems = (booking, fallbackAmount) =>
  (booking.serviceItems && booking.serviceItems.length > 0)
    ? booking.serviceItems.map(item => ({ name: item.name, price: item.price, quantity: item.quantity || 1 }))
    : [{ name: booking.serviceName || 'Service', price: fallbackAmount, quantity: 1 }];

const emitInvoiceCreated = (payload) => {
  try {
    emitEvent('invoiceCreated', payload);
  } catch (emitErr) {
    console.warn('Could not emit invoiceCreated socket event:', emitErr.message);
  }
};

// ── getInvoicePrefillData (staff "Generate Invoice" pre-fill) ──────────────
// NEW: backs the staff-triggered Generate Invoice flow on StaffInvoicePage.
// Covers two cases, distinguished by `mode` in the response:
//   - mode 'balance' — Advance+Balance bookings. Pre-fills the outstanding
//     balance against the advance invoice already made at booking time, per
//     Update 4.
//   - mode 'first' — COD / Pay-After-Completion bookings. No advance invoice
//     was ever meant to exist for these — the whole amount is invoiced once,
//     at job completion. Pre-fills straight from the Booking document
//     (customer, service items, price) so staff never re-type anything —
//     they only choose how it was paid and save.
//
// IMPORTANT: which mode applies is decided by booking.paymentMethod, NOT by
// merely checking whether an invoice already exists. routes/booking.js's
// /complete already auto-creates a COD/Pay-After-Completion booking's one
// invoice the moment it's marked complete (same as it does for the
// Advance+Balance remainder) — so by the time staff could reach this page,
// that invoice usually already exists. Deciding the mode purely from
// invoice-presence would misread that as "an advance invoice, ready for a
// -BAL settlement" and generate a nonsensical second invoice on top of an
// already-fully-invoiced COD job. Checking paymentMethod first avoids that;
// an already-invoiced COD/Pay-After-Completion booking is reported back as
// alreadySettled instead.
//
// @route   GET /api/invoices/prefill/:bookingId
// @access  Private (staff/admin)
exports.getInvoicePrefillData = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ msg: 'Invalid booking id.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ msg: 'Booking not found.' });

    // Any non-balance invoice for this booking — the advance invoice for
    // Advance+Balance, or the (possibly already auto-created) single
    // invoice for COD/Pay-After-Completion.
    const existingInvoice = await Invoice.findOne({
      bookingId: booking._id,
      isBalanceInvoice: { $ne: true },
    });
    const isAdvanceBalance = booking.paymentMethod === 'advance-balance';

    const bookingSummary = {
      _id:          booking._id,
      bookingId:    booking.bookingId,
      customerName: booking.customerName || 'Customer',
      email:        booking.customerEmail || booking.email || '',
      phone:        booking.phone || '',
      address:      booking.address || '',
      serviceName:  booking.serviceName || existingInvoice?.serviceItems?.[0]?.name || 'Service',
      date:         booking.date || '',
      time:         booking.time || '',
      paymentMethod: booking.paymentMethod || '',
    };

    // ── mode 'balance' — Advance+Balance ───────────────────────────────────
    if (isAdvanceBalance) {
      if (!existingInvoice) {
        return res.status(400).json({
          msg: 'This is an Advance+Balance booking but no advance invoice was found for it — check the booking before generating a balance invoice.',
        });
      }

      // Guard against generating a second -BAL invoice for the same booking
      // — also re-checked server-side in createBalanceInvoice, but surfacing
      // it here lets the UI disable the flow before staff fill anything in.
      const existingBalanceInvoice = await Invoice.findOne({
        bookingId: booking._id,
        isBalanceInvoice: true,
      });
      const balanceAmount = Math.max(0, existingInvoice.totalAmount - existingInvoice.paidAmount);

      return res.json({
        mode: 'balance',
        booking: bookingSummary,
        originalInvoice: {
          _id:           existingInvoice._id,
          invoiceNumber: existingInvoice.invoiceNumber,
          totalAmount:   existingInvoice.totalAmount,
          paidAmount:    existingInvoice.paidAmount,
        },
        balanceAmount,
        alreadySettled:               !!existingBalanceInvoice,
        existingBalanceInvoiceNumber: existingBalanceInvoice?.invoiceNumber || null,
      });
    }

    // ── mode 'first' — COD / Pay-After-Completion ──────────────────────────
    if (existingInvoice) {
      // Already invoiced — most likely by /complete's automatic path.
      // Nothing left for this manual flow to generate.
      return res.json({
        mode: 'first',
        booking: bookingSummary,
        originalInvoice: null,
        balanceAmount: 0,
        alreadySettled: true,
        existingBalanceInvoiceNumber: existingInvoice.invoiceNumber,
      });
    }
    if (!['cod', 'pay-after-completion'].includes(booking.paymentMethod)) {
      return res.status(400).json({
        msg: 'This booking has no invoice yet and is not Cash-on-Delivery / Pay-After-Completion — check the booking before generating one manually.',
      });
    }
    // The amount is only final once the job is actually done.
    if (booking.status !== 'completed') {
      return res.status(400).json({
        msg: 'This job has not been marked complete yet — the invoice amount is only final once the job is done.',
      });
    }

    res.json({
      mode: 'first',
      booking: bookingSummary,
      originalInvoice: null,
      balanceAmount: booking.price || 0,
      alreadySettled: false,
      existingBalanceInvoiceNumber: null,
    });
  } catch (error) {
    console.error('Error loading invoice prefill data:', error.message);
    res.status(500).json({ msg: 'Could not load booking details for this invoice.' });
  }
};

// ── createBalanceInvoice (staff "Generate Invoice" → save) ─────────────────
// NEW: the save step for the flow above. Route/function name kept as-is for
// compatibility with the URL StaffInvoicePage.tsx already calls, but this
// now covers both cases getInvoicePrefillData can return:
//   - mode 'balance' (Advance+Balance): links to the existing advance
//     invoice, produces `<original>-BAL` — unchanged from Update 4.
//   - mode 'first' (COD / Pay-After-Completion): this booking's one and
//     only invoice, generated once the job is complete. Mirrors
//     routes/booking.js's own createCompletionInvoice() convention exactly
//     (invoiceType 'COD' for cod else 'FINAL'; COD is always treated as
//     collected/PAID the same way that helper does, regardless of which
//     payment-method radio staff picked) so the result is identical to
//     what that automatic path would have produced.
// Deliberately separate from createInvoice (the blank walk-in-invoice form)
// — this always links to a REAL existing booking, never invents a
// placeholder Booking/User the way createInvoice does for manual walk-ins.
// Always re-derives which case applies server-side rather than trusting the
// client — the client only ever sends `paymentMethod`.
//
// @route   POST /api/invoices/balance/:bookingId
// @access  Private (staff/admin)
// @body    { paymentMethod: 'cash' | 'online' }
exports.createBalanceInvoice = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const paymentMethod = req.body?.paymentMethod === 'online' ? 'online' : 'cash';
    const isCashNow = paymentMethod === 'cash';

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ msg: 'Invalid booking id.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ msg: 'Booking not found.' });

    const isAdvanceBalance = booking.paymentMethod === 'advance-balance';

    // ── mode 'balance' — Advance+Balance ───────────────────────────────────
    // Decided from paymentMethod, not merely "does an invoice exist" — see
    // the long comment on getInvoicePrefillData for why that distinction
    // matters (COD/Pay-After-Completion already get their own invoice
    // auto-created by /complete, and would be misread as an advance invoice
    // otherwise).
    if (isAdvanceBalance) {
      const originalInvoice = await Invoice.findOne({
        bookingId: booking._id,
        isBalanceInvoice: { $ne: true },
      });
      if (!originalInvoice) {
        return res.status(400).json({ msg: 'No advance invoice found for this booking.' });
      }

      // Re-check server-side — the prefill endpoint's alreadySettled flag can
      // go stale if two staff members open the same booking at once. This is
      // what actually prevents the duplicate -BAL / E11000 crash.
      const existingBalanceInvoice = await Invoice.findOne({
        bookingId: booking._id,
        isBalanceInvoice: true,
      });
      if (existingBalanceInvoice) {
        return res.status(409).json({
          msg: `A balance invoice already exists for this booking: ${existingBalanceInvoice.invoiceNumber}.`,
        });
      }

      const balanceAmount = Math.max(0, originalInvoice.totalAmount - originalInvoice.paidAmount);

      const balanceInvoice = new Invoice({
        invoiceNumber:     `${originalInvoice.invoiceNumber}-BAL`,
        invoiceType:        'FINAL',
        isBalanceInvoice:   true,
        parentInvoiceId:    originalInvoice._id,
        mainCategories:     originalInvoice.mainCategories,
        bookingId:          booking._id,
        customer:           bookingCustomer(booking),
        serviceItems:       bookingServiceItems(booking, balanceAmount),
        subTotal:      balanceAmount,
        totalAmount:   balanceAmount,
        paidAmount:    isCashNow ? balanceAmount : 0,
        balanceAmount: isCashNow ? 0 : balanceAmount,
        // FIX (Tier 1.4 label fix, per spec): was 'Advance + Balance (Cash)'/
        // '(Online)' — see the matching change + rationale in
        // routes/booking.js's createCompletionInvoice, and the parsing
        // update in PaymentReportExport.tsx that keeps these categorizing
        // correctly in the payment report.
        paymentMethod: isCashNow ? 'COD' : 'Online Balance Payment',
        // FIX (Tier 3.3, same B.1 audit finding + rationale as the matching
        // change in routes/booking.js's createCompletionInvoice): 'UNPAID'
        // instead of 'SENT' for an unsettled balance invoice.
        status:        isCashNow ? 'PAID' : 'UNPAID',
        createdByStaff: req.user?.id,
      });
      await balanceInvoice.save();

      // NEW — log the cash collection to the payment ledger; recompute
      // will set paidAmount/balanceAmount/status on balanceInvoice to the
      // same values just set above (nothing else has been charged against
      // this brand-new invoice yet), so this doesn't change the outcome —
      // it's what makes this invoice's numbers ledger-derived going
      // forward. Nothing to log for the online case: no money has
      // actually moved yet, status stays 'SENT' until the webhook (see
      // routes/payhere.js) confirms it.
      if (isCashNow) {
        await recordPayment({
          invoiceId:  balanceInvoice._id,
          bookingId:  booking._id,
          customerId: booking.customerId,
          amount:     balanceAmount,
          direction:  'CHARGE',
          method:     'cash',
          label:      'Advance+Balance settlement (cash)',
          recordedBy: req.user?.id,
        });
      } else {
        // FIX (Tier 1.4): send the balance payment link immediately instead
        // of only relying on the hourly reminder cron — see the matching
        // fix in routes/booking.js's createCompletionInvoice for the full
        // rationale. Logs a PaymentReminder('first') record too, so the
        // cron doesn't send a duplicate "first" reminder later.
        try {
          await sendBalanceReminderEmail(balanceInvoice, 'first');
          await PaymentReminder.create({
            invoiceId:     balanceInvoice._id,
            invoiceNumber: balanceInvoice.invoiceNumber,
            customerId:    booking.customerId?.toString() || 'unknown',
            customerEmail: balanceInvoice.customer.email,
            amount:        balanceInvoice.balanceAmount,
            dueDate:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            reminderType:  'first',
            status:        'sent',
          });
        } catch (emailErr) {
          console.warn('Balance invoice created but immediate email failed (cron will retry):', emailErr.message);
        }
      }

      // The remaining balance now lives on this linked invoice — zero it out
      // on the original so nothing is tracked (or double-counted) in two
      // places. NOT a ledger event itself (no money moved against
      // originalInvoice here — the money moved against balanceInvoice,
      // logged above) — this is purely bookkeeping to say "this invoice's
      // balance has been superseded," so it stays a direct field write.
      originalInvoice.balanceAmount = 0;
      await originalInvoice.save({ validateBeforeSave: false });

      // Sync the Booking's own denormalized totals too (AdminBookings.tsx and
      // StaffDashboard.tsx both read these directly, not the Invoice
      // collection) — this is the sync step the online PayHere balance-payment
      // webhook was found to be missing; doing it here closes the same gap.
      if (isCashNow) {
        booking.paidAmount    = (booking.paidAmount || 0) + balanceAmount;
        booking.balanceAmount = 0;
        booking.balancePaid   = true;
        await booking.save({ validateBeforeSave: false });
      }

      emitInvoiceCreated({
        invoiceId: balanceInvoice._id, invoiceNumber: balanceInvoice.invoiceNumber,
        bookingId: booking._id, isBalanceInvoice: true,
      });
      return res.status(201).json(balanceInvoice);
    }

    // ── mode 'first' — COD / Pay-After-Completion ──────────────────────────
    // Re-check for an existing invoice server-side, same reason as the
    // balance branch above — most likely candidate is /complete's automatic
    // path having already created one between prefill and this save.
    const existingInvoice = await Invoice.findOne({
      bookingId: booking._id,
      isBalanceInvoice: { $ne: true },
    });
    if (existingInvoice) {
      return res.status(409).json({
        msg: `This booking already has an invoice: ${existingInvoice.invoiceNumber}.`,
      });
    }
    if (!['cod', 'pay-after-completion'].includes(booking.paymentMethod)) {
      return res.status(400).json({
        msg: 'This booking is not Cash-on-Delivery / Pay-After-Completion.',
      });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ msg: 'This job has not been marked complete yet.' });
    }

    const isCod = booking.paymentMethod === 'cod';
    // Matches createCompletionInvoice()'s own rule: COD is always treated as
    // collected on delivery, regardless of the payment-method radio — that
    // choice only actually matters for Pay-After-Completion.
    const collectedNow = isCod || isCashNow;
    const totalAmount  = booking.price || 0;

    const { prefix, categories } = determineInvoiceDetails(booking.serviceItems);
    const invoiceNumber = await generateInvoiceNumber(prefix);

    const invoice = new Invoice({
      invoiceNumber,
      invoiceType:    isCod ? 'COD' : 'FINAL',
      mainCategories: categories,
      bookingId:      booking._id,
      customer:       bookingCustomer(booking),
      serviceItems:   bookingServiceItems(booking, totalAmount),
      subTotal:      totalAmount,
      totalAmount,
      paidAmount:    collectedNow ? totalAmount : 0,
      balanceAmount: collectedNow ? 0 : totalAmount,
      paymentMethod: isCod ? 'Cash on Delivery' : (isCashNow ? 'Pay After Completion (Cash)' : 'Pay After Completion (Online)'),
      status:        collectedNow ? 'PAID' : 'UNPAID',
      createdByStaff: req.user?.id,
    });
    await invoice.save();

    // NEW — log the collection to the payment ledger (COD is always
    // collected on delivery; Pay-After-Completion only if `cash` was
    // picked). Nothing to log when not collectedNow — status stays
    // 'UNPAID' until the online webhook confirms it (routes/payhere.js).
    if (collectedNow) {
      await recordPayment({
        invoiceId:  invoice._id,
        bookingId:  booking._id,
        customerId: booking.customerId,
        amount:     totalAmount,
        direction:  'CHARGE',
        method:     isCod ? 'cod' : 'cash',
        label:      isCod ? 'COD collection' : 'Pay-After-Completion collection (cash)',
        recordedBy: req.user?.id,
      });
    }

    booking.paidAmount    = collectedNow ? totalAmount : (booking.paidAmount || 0);
    booking.balanceAmount = collectedNow ? 0 : totalAmount;
    booking.balancePaid   = collectedNow;
    await booking.save({ validateBeforeSave: false });

    emitInvoiceCreated({
      invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber,
      bookingId: booking._id, isBalanceInvoice: false,
    });
    res.status(201).json(invoice);
  } catch (error) {
    console.error('Error creating invoice for booking:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({ msg: 'An invoice with this number already exists for this booking.' });
    }
    res.status(500).json({ msg: 'Could not create the invoice.' });
  }
};

// ── approveInvoice ────────────────────────────────────────────────────────
// Admin approves a DRAFT staff-created invoice.
// Changes status DRAFT → SENT and sends the invoice email to the customer.
// @route   POST /api/invoices/:id/approve
// @access  Private (admin)
exports.approveInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    if (invoice.status !== 'DRAFT') {
      return res.status(400).json({ msg: `Invoice is already ${invoice.status} — only DRAFT invoices can be approved.` });
    }

    invoice.status = 'SENT';
    invoice.history.push({
      event:     'APPROVED',
      details:   `Invoice approved by admin (user: ${req.user?.id || 'unknown'}). Email sent to customer.`,
      timestamp: new Date(),
    });
    await invoice.save();

    // Send the invoice email to the customer immediately on approval
    await sendInvoiceEmail(invoice.customer.email, invoice);

    // Notify the customer via Socket.IO that their invoice is ready
    emitToUser(invoice.customer.userId?.toString(), 'notification', {
      type:      'order-confirmed',
      title:     'Your Invoice is Ready',
      message:   `Invoice ${invoice.invoiceNumber} for Rs. ${invoice.totalAmount.toLocaleString()} has been issued. Check your email for details.`,
      actionUrl: `/invoice/${invoice.bookingId}`,
    });

    // Real-time dashboard update — removes the DRAFT badge
    emitEvent('invoiceUpdate', invoice);

    res.json({ msg: 'Invoice approved and sent to customer.', invoice });
  } catch (error) {
    console.error('Error approving invoice:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── createCashInvoice ─────────────────────────────────────────────────────
// FIX: status was 'PENDING_CASH' — not in enum. Changed to 'SENT'.
exports.createCashInvoice = async (req, res) => {
  try {
    const { bookingId, serviceType, amount, customer } = req.body;
    if (!bookingId || !serviceType || !amount || !customer) {
      return res.status(400).json({ msg: 'Missing required fields for cash invoice.' });
    }

    const serviceItems  = [{ name: serviceType, price: amount }];
    const { prefix, categories } = determineInvoiceDetails(serviceItems);
    const invoiceNumber = await generateInvoiceNumber(prefix);

    const newInvoice = new Invoice({
      invoiceNumber,
      mainCategories: categories,
      invoiceType:    'COD',
      bookingId,
      customer,
      serviceItems,
      subTotal:       amount,
      totalAmount:    amount,
      paidAmount:     0,
      balanceAmount:  amount,
      status:         'SENT',
    });

    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('Error creating cash invoice:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── markAsPaid ────────────────────────────────────────────────────────────
exports.markAsPaid = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

    // NEW — the amount actually being collected by this action, before
    // it's zeroed out below. Recorded to the ledger as its own CHARGE
    // event (only if there's still something owed — calling this twice
    // shouldn't double-log a payment that already happened) rather than
    // just jumping paidAmount straight to totalAmount, so this invoice's
    // history shows a real "marked as paid" event, not just a final number.
    const amountBeingCollected = invoice.balanceAmount;

    invoice.paidAmount    = invoice.totalAmount;
    invoice.balanceAmount = 0;
    invoice.status        = 'PAID';
    invoice.history.push({ event: 'PAYMENT_RECEIVED', details: 'Marked as paid by staff.', timestamp: new Date() });
    // FIX: use validateBeforeSave:false because some legacy invoices have
    // customer.userId and bookingId stored as strings (pre-migration data).
    // We are only updating payment fields so skipping validation is safe here.
    await invoice.save({ validateBeforeSave: false });

    // Same legacy-data caveat applies here: some older invoices have a
    // non-ObjectId bookingId string, which the ledger can't reference —
    // skip logging for those rather than throwing (the direct field
    // write above already took effect either way, so behavior for that
    // edge case is unchanged from before this ledger existed).
    if (amountBeingCollected > 0 && mongoose.Types.ObjectId.isValid(invoice.bookingId)) {
      await recordPayment({
        invoiceId:  invoice._id,
        bookingId:  invoice.bookingId,
        customerId: mongoose.Types.ObjectId.isValid(invoice.customer?.userId) ? invoice.customer.userId : undefined,
        amount:     amountBeingCollected,
        direction:  'CHARGE',
        method:     'cash',
        label:      'Marked as paid by staff',
        recordedBy: req.user?.id,
      });
    } else if (amountBeingCollected > 0) {
      console.warn(`markAsPaid: skipped payment ledger entry for invoice ${invoice._id} — bookingId is not a valid ObjectId (legacy data).`);
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error marking invoice as paid:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── deleteInvoice ─────────────────────────────────────────────────────────
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });
    res.json({ msg: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error.message);
    res.status(500).send('Server Error');
  }
};

// ── generatePaymentLink ───────────────────────────────────────────────────
exports.generatePaymentLink = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });
    if (invoice.balanceAmount <= 0) return res.status(400).json({ msg: 'No outstanding balance on this invoice.' });

    const paymentLink = `${process.env.FRONTEND_URL}/balance-payment?invoiceId=${invoice._id}&balance=${invoice.balanceAmount}`;
    res.json({ paymentLink, balanceAmount: invoice.balanceAmount });
  } catch (error) {
    console.error('Error generating payment link:', error.message);
    res.status(500).send('Server Error');
  }
};

// REMOVED (task #20): payBalance used to live here, generating a PayHere
// checkout for the invoice balance but with no matching webhook still wired
// up (its notify_url pointed at the handlePayhereIPN cluster removed in
// task #16) and nothing in the frontend ever called it. Superseded by
// routes/payhere.js's generate-balance-hash + balance-notify, which is now
// the one place that builds AND completes an online balance payment — see
// the comment block there for the full A.3 sub-flow.

// ── getFinancialReport ────────────────────────────────────────────────────
exports.getFinancialReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const query = {};
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });

    const totalInvoiced  = invoices.reduce((s, i) => s + (i.totalAmount  || 0), 0);
    const totalCollected = invoices.reduce((s, i) => s + (i.paidAmount   || 0), 0);
    const totalPending   = invoices.reduce((s, i) => s + (i.balanceAmount || 0), 0);
    const totalRefunded  = invoices.filter(i => i.status === 'REFUNDED').reduce((s, i) => s + (i.totalAmount || 0), 0);

    res.json({
      summary: { totalInvoiced, totalCollected, totalPending, totalRefunded, count: invoices.length },
      invoices,
    });
  } catch (error) {
    console.error('Error generating financial report:', error.message);
    res.status(500).send('Server Error');
  }
};