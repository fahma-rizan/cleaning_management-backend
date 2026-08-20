const crypto   = require('crypto');
const Invoice  = require('../models/Invoice');
const Booking  = require('../models/Booking');
const User     = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Best-effort category codes from service item names — feeds both the
// invoice number prefix (INV-LND-..., INV-CUR-...) and mainCategories[],
// which drives the "Filter by Category" buttons on the Financial Dashboard.
const categoryCodesFor = (serviceItems = []) => {
  const codes = new Set();
  for (const item of serviceItems) {
    const text = (item.name || '').toLowerCase();
    if (text.includes('laundry'))  codes.add('LND');
    else if (text.includes('curtain'))  codes.add('CUR');
    else if (text.includes('shampoo') || text.includes('carpet') || text.includes('sofa') || text.includes('mattress')) codes.add('SVC');
    else if (text.includes('home') || text.includes('office') || text.includes('cleaning')) codes.add('HOC');
  }
  return Array.from(codes);
};

// Single dominant category code, used for the invoice number prefix.
// Falls back to 'GEN' when nothing matches.
const categoryCodeFor = (serviceItems = []) => categoryCodesFor(serviceItems)[0] || 'GEN';

const generateInvoiceNumber = async (serviceItems) => {
  const prefix = serviceItems && serviceItems.length > 1
    ? 'MULTI'
    : categoryCodeFor(serviceItems);
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

  // Sequence within the day for this prefix, so numbers stay readable
  // (INV-GEN-20260818-0001, -0002, ...) instead of fully random.
  const countToday = await Invoice.countDocuments({
    invoiceNumber: new RegExp(`^INV-${prefix}-${dateStr}-`),
  });
  const seq = (countToday + 1).toString().padStart(4, '0');
  return `INV-${prefix}-${dateStr}-${seq}`;
};

// Finds an existing Booking by its public bookingId string, or — for
// manually-created staff invoices with no real booking behind them yet —
// builds one so the invoice always has something real to point at.
const findOrCreateBooking = async ({ bookingId, customer, serviceItems, pricing, payment, serviceDate, serviceTime, serviceAddress }) => {
  let booking = bookingId ? await Booking.findOne({ bookingId }) : null;
  let wasCreated = false;

  if (!booking) {
    wasCreated = true;

    let customerUser = null;
    if (customer?.userId) customerUser = await User.findById(customer.userId).catch(() => null);
    if (!customerUser && customer?.email) customerUser = await User.findOne({ email: customer.email.toLowerCase() });

    if (!customerUser) {
      const nameParts = (customer?.name || 'Guest Customer').trim().split(/\s+/);
      customerUser = await User.create({
        firstName: nameParts[0] || 'Guest',
        lastName:  nameParts.slice(1).join(' ') || 'Customer',
        email:     customer?.email || `guest-${Date.now()}@cloudlaundry.lk`,
        password:  crypto.randomBytes(16).toString('hex'), // hashed by the User pre-save hook
        phone:     customer?.phone,
        address:   customer?.address,
        role:      'customer',
      });
    }

    const total       = pricing?.total ?? pricing?.basePrice ?? 0;
    const paidAmount   = payment?.paidAmount || 0;
    const isFullyPaid  = total > 0 && paidAmount >= total;

    booking = await Booking.create({
      bookingId:      bookingId || undefined, // schema auto-generates BK-<ts> if omitted
      customerId:     customerUser._id,
      customerName:   customer?.name,
      customerEmail:  customer?.email,
      serviceName:    serviceItems?.[0]?.name || 'General Service',
      date:           serviceDate,
      time:           serviceTime,
      address:        serviceAddress || customer?.address || 'N/A',
      price:          total,
      paidAmount,
      balanceAmount:  Math.max(0, total - paidAmount),
      status:         isFullyPaid ? 'confirmed' : 'pending',
      paymentStatus:  isFullyPaid ? 'paid' : (paidAmount > 0 ? 'partial' : 'pending'),
    });
  }

  return { booking, wasCreated };
};

// ─── POST /api/invoices ────────────────────────────────────────────────────────
const createInvoice = async (req, res) => {
  try {
    const {
      invoiceType, bookingId, customer, serviceItems = [], customizationItems = [],
      pricing, payment, serviceDate, serviceTime, serviceAddress, createdByStaff, status,
    } = req.body;

    if (!pricing) return res.status(400).json({ msg: 'Missing required fields.' });
    if (!customer || !customer.name || !customer.email) {
      return res.status(400).json({ msg: 'Missing required fields.' });
    }

    const { booking, wasCreated } = await findOrCreateBooking({
      bookingId, customer, serviceItems, pricing, payment, serviceDate, serviceTime, serviceAddress,
    });

    const total         = pricing.total ?? pricing.basePrice ?? 0;
    const paidAmount    = payment?.paidAmount || 0;
    const balanceAmount = payment?.balanceAmount ?? Math.max(0, total - paidAmount);
    const invoiceNumber = await generateInvoiceNumber(serviceItems);

    // Manually-created staff invoices (no pre-existing real booking) are
    // always held as DRAFT for admin approval, no matter what status/payment
    // string the frontend happened to send — only the admin's Approve action
    // in the Financial Dashboard is allowed to move it to SENT/customer email.
    let resolvedStatus;
    if (wasCreated && createdByStaff) {
      resolvedStatus = 'DRAFT';
    } else if (status && ['DRAFT', 'SENT', 'PAID', 'PARTIAL', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED'].includes(status.toUpperCase())) {
      resolvedStatus = status.toUpperCase();
    } else if (payment?.status && ['DRAFT', 'SENT', 'PAID', 'PARTIAL', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED'].includes(payment.status.toUpperCase())) {
      resolvedStatus = payment.status.toUpperCase();
    } else if (total > 0 && paidAmount >= total) {
      resolvedStatus = 'PAID';
    } else if (paidAmount > 0) {
      resolvedStatus = 'PARTIAL';
    } else {
      resolvedStatus = 'SENT';
    }

    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceType: (invoiceType || 'FULL').toUpperCase(),
      booking:   booking._id,
      bookingId: booking.bookingId,
      customer: {
        userId:  customer.userId,
        name:    customer.name,
        email:   customer.email,
        phone:   customer.phone,
        address: customer.address,
      },
      serviceItems,
      customizationItems,
      mainCategories: categoryCodesFor(serviceItems),
      pricing: {
        basePrice: pricing.basePrice ?? total,
        discount:  pricing.discount || 0,
        total,
      },
      discounts: pricing.discount ? [{ amount: pricing.discount, reason: 'Applied at checkout' }] : [],
      totalAmount: total,
      paidAmount,
      balanceAmount,
      paymentMethod: payment?.method,
      notes:         payment?.method,
      serviceDate:    serviceDate || booking.date,
      serviceTime:    serviceTime || booking.time,
      serviceAddress: serviceAddress || booking.address,
      createdByStaff,
      status: resolvedStatus,
    });

    req.app.get('io')?.emit('invoiceUpdate', invoice);
    res.status(201).json(invoice);
  } catch (err) {
    console.error('createInvoice error:', err);
    res.status(500).json({ msg: 'Failed to create invoice.' });
  }
};

// ─── GET /api/invoices ─────────────────────────────────────────────────────────
const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    console.error('getInvoices error:', err);
    res.status(500).json({ msg: 'Failed to load invoices.' });
  }
};

// ─── GET /api/invoices/booking/:bookingId ──────────────────────────────────────
const getInvoiceByBooking = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ bookingId: req.params.bookingId }).sort({ createdAt: -1 });
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found for this booking.' });
    res.json(invoice);
  } catch (err) {
    console.error('getInvoiceByBooking error:', err);
    res.status(500).json({ msg: 'Failed to load invoice.' });
  }
};

// ─── GET /api/invoices/:idOrNumber ─────────────────────────────────────────────
const getInvoice = async (req, res) => {
  try {
    const { idOrNumber } = req.params;
    const invoice = /^[0-9a-fA-F]{24}$/.test(idOrNumber)
      ? await Invoice.findById(idOrNumber)
      : await Invoice.findOne({ invoiceNumber: idOrNumber });
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });
    res.json(invoice);
  } catch (err) {
    console.error('getInvoice error:', err);
    res.status(500).json({ msg: 'Failed to load invoice.' });
  }
};

// ─── POST /api/invoices/:id/mark-as-paid ───────────────────────────────────────
const markAsPaid = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    invoice.paidAmount    = invoice.totalAmount;
    invoice.balanceAmount = 0;
    invoice.status        = 'PAID';
    await invoice.save();

    await Booking.findByIdAndUpdate(invoice.booking, {
      paidAmount: invoice.totalAmount, balanceAmount: 0, paymentStatus: 'paid', status: 'confirmed',
    });

    req.app.get('io')?.emit('invoiceUpdate', invoice);
    res.json(invoice);
  } catch (err) {
    console.error('markAsPaid error:', err);
    res.status(500).json({ msg: 'Failed to mark invoice as paid.' });
  }
};

// ─── POST /api/invoices/:id/approve ────────────────────────────────────────────
// Moves a staff-created DRAFT invoice to SENT and emails the customer.
const approveInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    invoice.status = 'SENT';
    await invoice.save();

    if (invoice.customer?.email) {
      await sendEmail({
        to: invoice.customer.email,
        subject: `Invoice #${invoice.invoiceNumber} — Cloud Laundry.lk`,
        html: `<p>Dear ${invoice.customer.name || 'Customer'},</p>
               <p>Your invoice <strong>${invoice.invoiceNumber}</strong> for Rs. ${invoice.totalAmount} is ready.</p>
               <p>Paid: Rs. ${invoice.paidAmount} — Balance: Rs. ${invoice.balanceAmount}</p>
               <p>Cloud Laundry.lk Team</p>`,
      });
      invoice.emailSentAt = new Date();
      await invoice.save();
    }

    req.app.get('io')?.emit('invoiceUpdate', invoice);
    res.json(invoice);
  } catch (err) {
    console.error('approveInvoice error:', err);
    res.status(500).json({ msg: 'Failed to approve invoice.' });
  }
};

// ─── PUT /api/invoices/:invoiceNumber/status ───────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber: req.params.invoiceNumber },
      { status: (status || '').toUpperCase() },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });
    req.app.get('io')?.emit('invoiceUpdate', invoice);
    res.json(invoice);
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ msg: 'Failed to update invoice status.' });
  }
};

// ─── POST /api/invoices/:invoiceNumber/send-email ──────────────────────────────
const sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });
    if (!invoice.customer?.email) return res.status(400).json({ msg: 'No customer email on this invoice.' });

    const sent = await sendEmail({
      to: invoice.customer.email,
      subject: `Invoice #${invoice.invoiceNumber} — Cloud Laundry.lk`,
      html: `<p>Dear ${invoice.customer.name || 'Customer'},</p>
             <p>Your invoice <strong>${invoice.invoiceNumber}</strong> for Rs. ${invoice.totalAmount} is ready.</p>
             <p>Paid: Rs. ${invoice.paidAmount} — Balance: Rs. ${invoice.balanceAmount}</p>
             <p>Cloud Laundry.lk Team</p>`,
    });

    invoice.emailSentAt = new Date();
    await invoice.save();

    res.json({ success: true, sent });
  } catch (err) {
    console.error('sendInvoiceEmail error:', err);
    res.status(500).json({ msg: 'Failed to send invoice email.' });
  }
};

module.exports = {
  createInvoice,
  getInvoices,
  getInvoiceByBooking,
  getInvoice,
  markAsPaid,
  approveInvoice,
  updateStatus,
  sendInvoiceEmail,
};
