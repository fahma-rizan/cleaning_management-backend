const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

/**
 * NEW — the one place money actually gets recorded now. Every call site
 * that used to hand-set/increment/decrement Invoice.paidAmount/
 * balanceAmount directly (controllers/invoiceController.js,
 * routes/booking.js, routes/payhere.js, controllers/refundController.js,
 * controllers/priceReductionController.js) now calls this instead,
 * describing what happened (charged X via cash, refunded Y via online) —
 * the actual arithmetic lives in one place (recomputeInvoiceAmounts below),
 * not six.
 *
 * Invoice.paidAmount/balanceAmount/status are NOT removed or renamed —
 * every existing read of them anywhere in the app keeps working
 * unchanged. They're now a cached projection of the Payment ledger
 * instead of being hand-maintained.
 *
 * @param {Object} opts
 * @param {string} opts.invoiceId
 * @param {string} opts.bookingId
 * @param {string} [opts.customerId]
 * @param {number} opts.amount        - always positive
 * @param {'CHARGE'|'REFUND'} [opts.direction] - default 'CHARGE'
 * @param {'cod'|'online'|'advance'|'pay-after-completion'|'cash'} opts.method
 * @param {string} [opts.label]       - human-readable description
 * @param {string} [opts.reference]   - PayHere payment/refund ID etc.
 * @param {string} [opts.recordedBy]  - staff/admin user id, for manual entries
 * @param {string} [opts.note]        - free-text audit note
 * @returns {Promise<Object|null>} the updated Invoice document
 */
async function recordPayment({
  invoiceId, bookingId, customerId, amount, direction = 'CHARGE',
  method, label, reference, recordedBy, note,
}) {
  if (!invoiceId) throw new Error('recordPayment requires invoiceId');
  if (!bookingId) throw new Error('recordPayment requires bookingId');
  if (!(amount > 0)) throw new Error('recordPayment requires a positive amount');
  if (!['CHARGE', 'REFUND'].includes(direction)) {
    throw new Error("recordPayment: direction must be 'CHARGE' or 'REFUND'");
  }
  if (!['cod', 'online', 'advance', 'pay-after-completion', 'cash'].includes(method)) {
    throw new Error(`recordPayment: unrecognised method '${method}'`);
  }

  // Defensive: customerId/recordedBy are optional on the schema, but come
  // from a few different shapes at the various call sites (a raw booking
  // field, req.user?.id, an invoice's populated customer.userId — which
  // can itself be a leftover string on legacy pre-migration data). Rather
  // than repeat an isValid check at every call site, silently omit either
  // one here if it isn't a real ObjectId instead of letting Payment.create
  // throw a CastError over an optional field.
  const safeCustomerId = mongoose.Types.ObjectId.isValid(customerId) ? customerId : undefined;
  const safeRecordedBy = mongoose.Types.ObjectId.isValid(recordedBy) ? recordedBy : undefined;

  await Payment.create({
    invoiceId,
    bookingId,
    customerId: safeCustomerId,
    amount,
    direction,
    method,
    status: direction === 'REFUND' ? 'refunded' : 'paid',
    label: label || '',
    gatewayId: reference || undefined,
    paidAt: new Date(),
    metadata: note ? { note } : undefined,
    audit: { createdBy: safeRecordedBy },
  });

  return recomputeInvoiceAmounts(invoiceId);
}

/**
 * Sums every Payment for this invoice (CHARGE minus REFUND) and writes the
 * result back onto Invoice.paidAmount/balanceAmount, with a best-effort
 * status sync.
 *
 * Only auto-adjusts status when it's already one of the plain
 * payment-driven values (PAID/PARTIAL/UNPAID/REFUNDED) — DRAFT, SENT,
 * REFUND_PENDING and CANCELLED are set deliberately elsewhere for reasons
 * that aren't just "how much has been paid so far" (e.g. DRAFT means
 * "not yet approved by admin", REFUND_PENDING means "a Refund request is
 * open but not processed yet") and shouldn't be silently overwritten by a
 * recompute.
 */
async function recomputeInvoiceAmounts(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return null;

  const payments = await Payment.find({ invoiceId });
  const totalCharged = payments
    .filter(p => p.direction === 'CHARGE')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalRefunded = payments
    .filter(p => p.direction === 'REFUND')
    .reduce((sum, p) => sum + p.amount, 0);
  const netPaid = Math.max(0, parseFloat((totalCharged - totalRefunded).toFixed(2)));

  invoice.paidAmount = netPaid;
  invoice.balanceAmount = Math.max(0, parseFloat(((invoice.totalAmount || 0) - netPaid).toFixed(2)));

  const autoStatuses = ['PAID', 'PARTIAL', 'UNPAID', 'REFUNDED'];
  if (autoStatuses.includes(invoice.status)) {
    if (netPaid <= 0) {
      invoice.status = totalRefunded > 0 ? 'REFUNDED' : 'UNPAID';
    } else if (invoice.balanceAmount > 0) {
      invoice.status = 'PARTIAL';
    } else {
      invoice.status = 'PAID';
    }
  }

  // FIX: some legacy invoices have customer.userId/bookingId stored as
  // plain strings (pre-migration data, per markAsPaid's own comment) —
  // skipping validation here is the same trade-off that call site already
  // made, since this save only ever touches payment fields.
  await invoice.save({ validateBeforeSave: false });
  return invoice;
}

module.exports = { recordPayment, recomputeInvoiceAmounts };
