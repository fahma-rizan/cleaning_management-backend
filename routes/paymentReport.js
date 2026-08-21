const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Invoice = require('../models/Invoice');

// Ported from backend-payment-workflow — queries this repo's real Invoice
// schema directly (customer.name/email/phone, totalAmount, paidAmount,
// balanceAmount, serviceItems, status), no adaptation needed there.

const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

// ─── GET /api/payment-report ────────────────────────────────────────────────────
// totalCollected uses paidAmount (actual cash received), not totalAmount
// (which would inflate figures by uncollected balances).
router.get('/', protect, async (req, res) => {
  try {
    const { userId, status, fromDate, toDate, customerName, customerPhone } = req.query;
    const query = {};

    if (userId)        query['customer.userId'] = userId;
    if (customerName)  query['customer.name']    = { $regex: customerName, $options: 'i' };
    if (customerPhone) query['customer.phone']   = { $regex: customerPhone };
    if (status)         query.status             = status.toUpperCase();
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });

    const totalInvoiced  = invoices.reduce((s, inv) => s + (inv.totalAmount   || 0), 0);
    const totalCollected = invoices.reduce((s, inv) => s + (inv.paidAmount    || 0), 0);
    const totalPending   = invoices.reduce((s, inv) => s + (inv.balanceAmount || 0), 0);

    res.json({
      summary: { totalInvoiced, totalCollected, totalPending, count: invoices.length },
      invoices,
    });
  } catch (error) {
    console.error('Error generating payment report:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// ─── GET /api/payment-report/export ─────────────────────────────────────────────
router.get('/export', protect, async (req, res) => {
  try {
    const { fromDate, toDate, status, customerName } = req.query;
    const query = {};
    if (status)        query.status            = status.toUpperCase();
    if (customerName)  query['customer.name']  = { $regex: customerName, $options: 'i' };
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });

    const headers = [
      'Invoice No.', 'Booking ID', 'Customer Name', 'Customer Email',
      'Customer Phone', 'Service', 'Invoice Type',
      'Total Invoiced (Rs)', 'Paid (Rs)', 'Balance (Rs)', 'Status', 'Date',
    ];

    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.bookingId,
      inv.customer?.name  || '',
      inv.customer?.email || '',
      inv.customer?.phone || '',
      inv.serviceItems?.[0]?.name || '',
      inv.invoiceType,
      inv.totalAmount,
      inv.paidAmount,
      inv.balanceAmount,
      inv.status,
      new Date(inv.createdAt).toLocaleDateString(),
    ]);

    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment_report_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting payment report:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;
