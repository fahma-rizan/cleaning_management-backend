const crypto  = require('crypto');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const User    = require('../models/User');

const md5 = (str) => crypto.createHash('md5').update(str).digest('hex').toUpperCase();

// PayHere's documented hash formula:
// MD5( merchant_id + order_id + amount(2dp) + currency + MD5(merchant_secret).toUpperCase() ).toUpperCase()
const buildHash = (merchantId, orderId, amount, currency, merchantSecret) => {
  const secretHash = md5(merchantSecret);
  return md5(`${merchantId}${orderId}${Number(amount).toFixed(2)}${currency}${secretHash}`);
};

// ─── POST /api/payhere/generate-hash ───────────────────────────────────────────
// Body: { bookingId, paymentMethod }
// Builds the PayHere sandbox checkout params + hash, and creates a PENDING
// invoice for this booking so the rest of the system (Financial Dashboard,
// invoice viewer, notifications) has something to track while the customer
// is on PayHere's hosted checkout page.
const generateHash = async (req, res) => {
  try {
    const { bookingId, paymentMethod } = req.body;
    const booking = /^[0-9a-fA-F]{24}$/.test(bookingId)
      ? await Booking.findOne({ $or: [{ _id: bookingId }, { bookingId }] })
      : await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ msg: 'Booking not found.' });

    const merchantId     = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    if (!merchantId || !merchantSecret) {
      return res.status(503).json({
        msg: 'PayHere is not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET in backend/.env (from your sandbox.payhere.lk merchant dashboard).',
      });
    }

    const isAdvance = paymentMethod === 'advance-balance';
    const amount = isAdvance ? Math.round(booking.price * 0.2) : booking.price;

    const [firstName, ...rest] = (booking.customerName || 'Customer').split(' ');

    const orderId = booking.bookingId;
    const currency = 'LKR';
    const hash = buildHash(merchantId, orderId, amount, currency, merchantSecret);

    const backendUrl  = process.env.BACKEND_PUBLIC_URL  || `http://localhost:${process.env.PORT || 5000}`;
    const frontendUrl = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';

    const payhere_payment = {
      sandbox:     'true',
      merchant_id: merchantId,
      return_url:  `${frontendUrl}/payment-success?order_id=${orderId}`,
      cancel_url:  `${frontendUrl}/payment-failed?order_id=${orderId}`,
      notify_url:  `${backendUrl}/api/payhere/notify`,
      order_id:    orderId,
      items:       booking.serviceName || 'Cloud Laundry Service',
      currency,
      amount: amount.toFixed(2),
      first_name: firstName || 'Customer',
      last_name:  rest.join(' ') || '',
      email:      booking.customerEmail || 'customer@cloudlaundry.lk',
      phone:      '0770000000',
      address:    booking.address || 'N/A',
      city:       'Colombo',
      country:    'Sri Lanka',
    };

    // Pending invoice for this checkout attempt — will be confirmed to
    // PAID by the PayHere IPN webhook once the customer actually pays.
    let invoice = await Invoice.findOne({ bookingId: orderId, status: { $in: ['DRAFT', 'SENT'] } });
    if (!invoice) {
      invoice = await Invoice.create({
        invoiceNumber: `INV-PAY-${Date.now()}`,
        invoiceType: isAdvance ? 'ADVANCE' : 'FULL',
        booking: booking._id,
        bookingId: orderId,
        customer: {
          userId: booking.customerId,
          name: booking.customerName,
          email: booking.customerEmail,
          address: booking.address,
        },
        serviceItems: [{ name: booking.serviceName, price: booking.price, quantity: 1 }],
        mainCategories: [],
        pricing: { basePrice: booking.price, discount: 0, total: booking.price },
        totalAmount: booking.price,
        paidAmount: 0,
        balanceAmount: booking.price,
        paymentMethod: 'PayHere Online',
        notes: 'PayHere Online',
        serviceDate: booking.date,
        serviceTime: booking.time,
        serviceAddress: booking.address,
        status: 'SENT',
      });
    }

    res.json({ payhere_payment, hash, booking, invoice });
  } catch (err) {
    console.error('generateHash error:', err);
    res.status(500).json({ msg: 'Failed to initiate PayHere payment.' });
  }
};

// ─── POST /api/payhere/notify ──────────────────────────────────────────────────
// PayHere's server-to-server IPN webhook. Only reachable if notify_url is a
// publicly-accessible address (e.g. an ngrok tunnel to this backend) —
// localhost alone can never receive this in local dev.
const notify = async (req, res) => {
  try {
    const {
      merchant_id, order_id, payhere_amount, payhere_currency,
      status_code, md5sig,
    } = req.body;

    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const expectedSig = md5(
      `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${md5(merchantSecret)}`
    );
    if (expectedSig !== md5sig) {
      console.warn('PayHere IPN signature mismatch for order', order_id);
      return res.status(400).send('Invalid signature');
    }

    if (String(status_code) === '2') { // 2 = success
      const booking = await Booking.findOne({ bookingId: order_id });
      if (booking) {
        const paid = parseFloat(payhere_amount);
        booking.paidAmount    = (booking.paidAmount || 0) + paid;
        booking.balanceAmount = Math.max(0, booking.price - booking.paidAmount);
        booking.paymentStatus = booking.balanceAmount === 0 ? 'paid' : 'partial';
        booking.status        = 'confirmed';
        await booking.save();

        const invoice = await Invoice.findOne({ bookingId: order_id }).sort({ createdAt: -1 });
        if (invoice) {
          invoice.paidAmount    = booking.paidAmount;
          invoice.balanceAmount = booking.balanceAmount;
          invoice.status        = booking.balanceAmount === 0 ? 'PAID' : 'PARTIAL';
          await invoice.save();
          req.app.get('io')?.emit('invoiceUpdate', invoice);
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('PayHere notify error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = { generateHash, notify };
