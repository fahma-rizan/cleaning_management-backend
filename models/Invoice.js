const mongoose = require('mongoose');

// INVOICE MODEL — backs the payment-invoice-notifications feature set
// (customer PaymentPage checkout, StaffInvoicePage manual invoices, the
// admin FinancialDashboard, RefundWorkflow, PriceReductionWorkflow, and the
// public Invoice/StaffInvoiceViewer pages).
const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true, index: true }, // e.g. INV-GEN-20260818-0001

    invoiceType: {
      type: String,
      enum: ['FULL', 'ADVANCE', 'FINAL', 'COD', 'GENERAL', 'REFUND'],
      default: 'FULL',
    },

    // Linked booking — every invoice always has one (existing bookings are
    // looked up by their public bookingId string; manually-created staff
    // invoices get a brand-new Booking document built for them).
    booking:   { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    bookingId: { type: String }, // denormalised Booking.bookingId, e.g. BK-1714...

    customer: {
      // Mixed, not ObjectId — some legacy documents in this shared collection
      // store a placeholder string here (e.g. "user-001") instead of a real
      // Mongo _id, and a strict ObjectId type throws a cast error just by
      // reading those documents back out.
      userId:  { type: mongoose.Schema.Types.Mixed },
      name:    { type: String },
      email:   { type: String },
      phone:   { type: String },
      address: { type: String },
    },

    serviceItems:       [{ name: String, price: Number, quantity: Number }],
    customizationItems: [{ name: String, price: Number, quantity: Number }],

    // Category codes present in serviceItems (LND/CUR/SVC/HOC) — drives the
    // "Filter by Category" buttons on the admin Financial Dashboard.
    mainCategories: [{ type: String }],

    pricing: {
      basePrice: { type: Number, default: 0 },
      discount:  { type: Number, default: 0 },
      total:     { type: Number, default: 0 },
    },
    // Discount history — FinancialDashboard/PriceReductionWorkflow append here.
    discounts: [{ amount: Number, reason: String, appliedAt: { type: Date, default: Date.now } }],

    // Flattened copies of pricing/payment for the many frontend pages that
    // read invoice.totalAmount / invoice.paidAmount / invoice.balanceAmount
    // directly instead of drilling into nested objects.
    totalAmount:   { type: Number, default: 0 },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    paymentMethod: { type: String }, // 'Cash', 'PayHere Online', etc.
    notes:         { type: String },

    serviceDate:    { type: String },
    serviceTime:    { type: String },
    serviceAddress: { type: String },

    createdByStaff: { type: String }, // User._id or 'system'

    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'PAID', 'PARTIAL', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED'],
      default: 'DRAFT',
    },

    emailSentAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
