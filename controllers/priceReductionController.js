const PriceReduction = require('../models/PriceReduction');
const Invoice        = require('../models/Invoice');

// ─── POST /api/price-reductions/request ────────────────────────────────────────
// Body: { invoiceId, requestedAmount, reason }
const requestReduction = async (req, res) => {
  try {
    const { invoiceId, requestedAmount, reason } = req.body;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ msg: 'Invoice not found.' });

    const reduction = await PriceReduction.create({
      invoiceId,
      bookingId:    invoice.bookingId,
      customerName: invoice.customer?.name,
      requestedAmount,
      reason,
    });

    res.status(201).json(reduction);
  } catch (err) {
    console.error('requestReduction error:', err);
    res.status(500).json({ msg: 'Failed to submit price reduction request.' });
  }
};

// ─── POST /api/price-reductions/approve/:id ────────────────────────────────────
const approveReduction = async (req, res) => {
  try {
    const reduction = await PriceReduction.findById(req.params.id);
    if (!reduction) return res.status(404).json({ msg: 'Request not found.' });

    reduction.status         = 'approved';
    reduction.approvedAmount = req.body?.approvedAmount ?? reduction.requestedAmount;
    reduction.reviewedAt     = new Date();
    await reduction.save();

    const invoice = await Invoice.findById(reduction.invoiceId);
    if (invoice) {
      invoice.pricing.discount = (invoice.pricing.discount || 0) + reduction.approvedAmount;
      invoice.pricing.total    = Math.max(0, invoice.pricing.total - reduction.approvedAmount);
      invoice.totalAmount      = invoice.pricing.total;
      invoice.balanceAmount    = Math.max(0, invoice.totalAmount - invoice.paidAmount);
      invoice.discounts.push({ amount: reduction.approvedAmount, reason: reduction.reason || 'Price reduction approved' });
      if (invoice.balanceAmount === 0) invoice.status = 'PAID';
      else if (invoice.paidAmount > 0) invoice.status = 'PARTIAL';
      await invoice.save();
      req.app.get('io')?.emit('invoiceUpdate', invoice);
    }

    res.json(reduction);
  } catch (err) {
    console.error('approveReduction error:', err);
    res.status(500).json({ msg: 'Failed to approve request.' });
  }
};

// ─── POST /api/price-reductions/reject/:id ─────────────────────────────────────
const rejectReduction = async (req, res) => {
  try {
    const reduction = await PriceReduction.findById(req.params.id);
    if (!reduction) return res.status(404).json({ msg: 'Request not found.' });

    reduction.status     = 'rejected';
    reduction.reviewNote  = req.body?.reason || '';
    reduction.reviewedAt  = new Date();
    await reduction.save();

    res.json(reduction);
  } catch (err) {
    console.error('rejectReduction error:', err);
    res.status(500).json({ msg: 'Failed to reject request.' });
  }
};

// ─── GET /api/price-reductions ─────────────────────────────────────────────────
const getReductions = async (req, res) => {
  try {
    const reductions = await PriceReduction.find().sort({ createdAt: -1 });
    res.json(reductions);
  } catch (err) {
    console.error('getReductions error:', err);
    res.status(500).json({ msg: 'Failed to load requests.' });
  }
};

module.exports = { requestReduction, approveReduction, rejectReduction, getReductions };
