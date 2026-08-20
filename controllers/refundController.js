const Refund  = require('../models/Refund');
const Invoice = require('../models/Invoice');
const sendEmail = require('../utils/sendEmail');

// ─── POST /api/refunds/request ─────────────────────────────────────────────────
// Body: { invoiceId, reason }
const requestRefund = async (req, res) => {
  try {
    const { invoiceId, reason } = req.body;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    const refund = await Refund.create({
      bookingId:    invoice.booking,
      bookingRef:   invoice.bookingId,
      invoiceId:    invoice._id,
      customerId:   invoice.customer?.userId,
      customerName: invoice.customer?.name,
      amount:       invoice.paidAmount,
      reason:       reason || '',
    });

    invoice.status = 'REFUND_PENDING';
    await invoice.save();

    req.app.get('io')?.emit('invoiceUpdate', invoice);
    res.status(201).json(refund);
  } catch (err) {
    console.error('requestRefund error:', err);
    res.status(500).json({ msg: 'Failed to submit refund request.' });
  }
};

// ─── POST /api/refunds/approve/:id ─────────────────────────────────────────────
// Approves the refund and returns the updated INVOICE (the frontend reads
// invoice fields — invoiceNumber, bookingId, customer, serviceItems — off
// the response to build the refund receipt it shows the customer).
const approveRefund = async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ msg: 'Refund not found.' });

    refund.status     = 'approved';
    refund.reviewNote  = req.body?.note || '';
    refund.reviewedAt  = new Date();
    await refund.save();

    const invoice = refund.invoiceId
      ? await Invoice.findById(refund.invoiceId)
      : await Invoice.findOne({ bookingId: refund.bookingRef }).sort({ createdAt: -1 });
    if (invoice) {
      invoice.status = 'REFUNDED';
      await invoice.save();

      if (invoice.customer?.email) {
        await sendEmail({
          to: invoice.customer.email,
          subject: `Refund Initiated — Rs. ${refund.amount} — Cloud Laundry.lk`,
          html: `<p>Dear ${invoice.customer.name || 'Customer'},</p>
                 <p>Your refund of Rs. ${refund.amount} for booking ${refund.bookingRef} has been approved.</p>
                 <p>Reason: ${refund.reason || '—'}</p>
                 <p>It will appear in your account within 5-7 business days.</p>
                 <p>Cloud Laundry.lk Support Team</p>`,
        });
      }
      req.app.get('io')?.emit('invoiceUpdate', invoice);
      return res.json(invoice);
    }

    // No linked invoice (shouldn't normally happen) — fall back to the refund itself.
    res.json(refund);
  } catch (err) {
    console.error('approveRefund error:', err);
    res.status(500).json({ msg: 'Failed to approve refund.' });
  }
};

// ─── POST /api/refunds/reject/:id ──────────────────────────────────────────────
const rejectRefund = async (req, res) => {
  try {
    const { reason } = req.body;
    const refund = await Refund.findById(req.params.id);
    if (!refund) return res.status(404).json({ msg: 'Refund not found.' });

    refund.status      = 'rejected';
    refund.reviewNote   = reason || '';
    refund.reviewedAt   = new Date();
    await refund.save();

    // Restore the invoice to its prior paid state — it's no longer pending a refund.
    const invoice = refund.invoiceId
      ? await Invoice.findById(refund.invoiceId)
      : await Invoice.findOne({ bookingId: refund.bookingRef }).sort({ createdAt: -1 });
    if (invoice && invoice.status === 'REFUND_PENDING') {
      invoice.status = invoice.balanceAmount > 0 ? 'PARTIAL' : 'PAID';
      await invoice.save();
      req.app.get('io')?.emit('invoiceUpdate', invoice);
    }

    res.json(refund);
  } catch (err) {
    console.error('rejectRefund error:', err);
    res.status(500).json({ msg: 'Failed to reject refund.' });
  }
};

// ─── GET /api/refunds ──────────────────────────────────────────────────────────
// FinancialDashboard.tsx expects each row shaped as
// { _id, invoice: { invoiceNumber, totalAmount, bookingId, customer }, refundedAmount, status: 'PENDING'|'APPROVED'|'REJECTED', reason, createdAt }
// — not the raw Refund document, which uses lowercase status/`amount`.
const getRefunds = async (req, res) => {
  try {
    const refunds = await Refund.find().sort({ createdAt: -1 }).lean();

    const invoiceIds = refunds.map(r => r.invoiceId).filter(Boolean);
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } }).lean();
    const invoiceById = new Map(invoices.map(inv => [String(inv._id), inv]));
    // Legacy refunds (created before invoiceId existed) — fall back to bookingRef.
    const byBookingRef = new Map(invoices.map(inv => [inv.bookingId, inv]));

    const shaped = refunds.map(r => {
      const invoice = (r.invoiceId && invoiceById.get(String(r.invoiceId))) || byBookingRef.get(r.bookingRef);
      return {
        _id: r._id,
        invoice: invoice ? {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount:   invoice.totalAmount,
          bookingId:     invoice.bookingId,
          customer:      { name: invoice.customer?.name, email: invoice.customer?.email },
        } : {
          invoiceNumber: r.bookingRef || 'N/A',
          totalAmount:   r.amount ?? r.refundedAmount ?? 0,
          bookingId:     r.bookingRef,
          customer:      { name: r.customerName, email: '' },
        },
        refundedAmount: r.amount ?? r.refundedAmount ?? 0,
        status:         (r.status || 'pending').toUpperCase(),
        reason:         r.reason || '',
        createdAt:      r.createdAt,
      };
    });

    res.json(shaped);
  } catch (err) {
    console.error('getRefunds error:', err);
    res.status(500).json({ msg: 'Failed to load refunds.' });
  }
};

module.exports = { requestRefund, approveRefund, rejectRefund, getRefunds };
