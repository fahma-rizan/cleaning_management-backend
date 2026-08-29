const crypto = require('crypto');

// FIX: Do NOT read env vars at module load time (top-level const).
// Previously: const merchantId = process.env.PAYHERE_MERCHANT_ID;
// If the module was required before dotenv.config() ran (e.g. in tests or if
// import order changed), these would be undefined and the MD5 hash would be
// silently wrong — causing payment failures or security issues.
// Now each function reads the vars from process.env at call time, guaranteeing
// they are always current regardless of when the module is imported.

/**
 * Generates the data required for a PayHere checkout form.
 * @param {object} invoice - The invoice object from MongoDB.
 * @returns {object} The formatted data for the PayHere payment form.
 */
const generateCheckoutData = (invoice) => {
  // FIX: Read env vars inside the function — not at module level
  const merchantId     = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  const baseUrl        = process.env.BASE_URL;

  if (!merchantId || !merchantSecret) {
    throw new Error('PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET must be set in .env');
  }

  const orderId   = invoice.invoiceNumber;
  const invoiceId = invoice._id;
  const currency  = 'LKR';
  const customer  = invoice.customer;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // FIX: Use invoice.paidAmount instead of invoice.totalAmount.
  // Previously this always charged the full invoice total regardless of
  // whether it was an ADVANCE (20%) or FULL invoice. Customers who chose
  // to pay only the advance deposit were being overcharged the full amount.
  // invoice.paidAmount is set correctly at invoice creation:
  //   ADVANCE invoice → 20% of total
  //   FULL invoice    → 100% of total
  const amountLKR = invoice.paidAmount;

  if (!amountLKR || amountLKR <= 0) {
    throw new Error(`Invalid paidAmount on invoice ${orderId}: ${amountLKR}`);
  }

  const serviceType = invoice.serviceItems?.[0]?.name || 'Cleaning Service';

  // FIX: Guard against customer.name being undefined before calling .split()
  const fullName    = customer?.name || 'Customer';
  const nameParts   = fullName.trim().split(/\s+/);
  const firstName   = nameParts[0];
  // FIX: Use the full name as last_name fallback instead of a single space ' '.
  // PayHere may reject or display oddly when last_name is blank/whitespace.
  const lastName    = nameParts.slice(1).join(' ') || fullName;

  // Generate the PayHere security hash (double-MD5 scheme)
  const hashedSecret = crypto
    .createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();

  const hash = crypto
    .createHash('md5')
    .update(merchantId + orderId + amountLKR.toFixed(2) + currency + hashedSecret)
    .digest('hex')
    .toUpperCase();

  return {
    merchant_id: merchantId,
    // FIX (task #20): this is now used exclusively for the online
    // Advance+Balance balance payment (routes/payhere.js's
    // generate-balance-hash / balance-notify). It used to point at
    // invoiceController's createPayhereCheckout/handlePayhereIPN cluster,
    // which was removed (task #16) as a second, unused, buggy PayHere
    // integration — this is the one real online-checkout flow now, matching
    // the "browser confirms via webhook" pattern already used for new
    // bookings in routes/payhere.js's /generate-hash and /notify.
    return_url:  `${frontendUrl}/balance-payment?invoiceId=${invoiceId}&payment_status=returned`,
    cancel_url:  `${frontendUrl}/balance-payment?invoiceId=${invoiceId}&payment_status=cancelled`,
    notify_url:  `${baseUrl}/api/payhere/balance-notify`,
    order_id:    orderId,
    items:       serviceType,
    currency,
    amount:      amountLKR.toFixed(2),
    first_name:  firstName,
    last_name:   lastName,
    email:       customer?.email   || '',
    phone:       customer?.phone   || 'N/A',
    address:     customer?.address || 'N/A',
    city:        customer?.city    || 'Colombo',
    country:     'Sri Lanka',
    hash,
  };
};

/**
 * Validates the MD5 signature from a PayHere IPN request.
 * @param {object} ipnData - The IPN request body from PayHere.
 * @returns {boolean} True if the signature is valid.
 */
const validateIpnSignature = (ipnData) => {
  // FIX: Read env vars inside the function — not at module level
  const merchantId     = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

  if (!merchantId || !merchantSecret) {
    console.error('PayHere credentials not set — IPN validation cannot proceed');
    return false;
  }

  const {
    order_id:       invoiceNumber,
    status_code,
    md5sig,
    currency,
    payhere_amount,
  } = ipnData;

  const hashedSecret = crypto
    .createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();

  const localMd5sig = crypto
    .createHash('md5')
    .update(
      merchantId +
      invoiceNumber +
      payhere_amount +
      currency +
      status_code +
      hashedSecret
    )
    .digest('hex')
    .toUpperCase();

  return localMd5sig === md5sig;
};

module.exports = {
  generateCheckoutData,
  validateIpnSignature,
};