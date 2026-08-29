const express = require('express');
const router  = express.Router();
const Invoice = require('../models/Invoice');
const auth    = require('../middleware/auth');

// ── CSV escape helper ─────────────────────────────────────────────────────
// FIX: Escape double-quote characters inside field values so the CSV is valid
// when customer names or addresses contain quotes. RFC 4180 says to double them.
const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

// @route  GET /api/payment-report
// @desc   Get payment report with filters (admin use)
// @access Private (admin)
//
// FIX 1: Added auth middleware — previously fully public, exposing customer PII.
// FIX 2: totalRevenue now uses paidAmount (actual money collected).
//         Before it used totalAmount which inflated figures by uncollected
//         balances — a Rs. 10,000 booking with only Rs. 2,000 paid showed as
//         Rs. 10,000 revenue. Added totalInvoiced separately for reference.
router.get('/', auth, async (req, res) => {
  try {
    const { userId, status, fromDate, toDate, customerName, customerPhone } = req.query;

    const query = {};

    if (userId)        query['customer.userId'] = userId;
    if (customerName)  query['customer.name']   = { $regex: customerName, $options: 'i' };
    if (customerPhone) query['customer.phone']  = { $regex: customerPhone };
    if (status)        query.status             = status.toUpperCase();

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate + 'T23:59:59');
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });

    // FIX 2: Use paidAmount for actual collected revenue, not totalAmount
    const totalInvoiced  = invoices.reduce((s, inv) => s + (inv.totalAmount  || 0), 0);
    const totalCollected = invoices.reduce((s, inv) => s + (inv.paidAmount   || 0), 0);
    const totalPending   = invoices.reduce((s, inv) => s + (inv.balanceAmount || 0), 0);

    res.json({
      summary: {
        totalInvoiced,   // total value of all invoices (may include unpaid balances)
        totalCollected,  // actual cash received — the real revenue figure
        totalPending,    // outstanding balances yet to be collected
        count: invoices.length,
      },
      invoices,
    });
  } catch (error) {
    console.error('Error generating payment report:', error.message);
    res.status(500).json({ message: 'Failed to generate payment report' });
  }
});

// @route  GET /api/payment-report/export
// @desc   Export payment report as CSV
// @access Private (admin)
//
// FIX 1: Added auth middleware — previously exported full customer PII
//         (names, emails, phones, amounts) to any unauthenticated caller.
// FIX 2: CSV values are now properly escaped so quotes inside field values
//         do not break the file in Excel or Google Sheets.
router.get('/export', auth, async (req, res) => {
  try {
    const { fromDate, toDate, status, customerName } = req.query;

    const query = {};
    if (status)       query.status           = status.toUpperCase();
    if (customerName) query['customer.name'] = { $regex: customerName, $options: 'i' };
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
      inv.customer?.name    || '',
      inv.customer?.email   || '',
      inv.customer?.phone   || '',
      inv.serviceItems?.[0]?.name || '',
      inv.invoiceType,
      inv.totalAmount,   // total value of the invoice
      inv.paidAmount,    // what was actually collected
      inv.balanceAmount,
      inv.status,
      new Date(inv.createdAt).toLocaleDateString(),
    ]);

    // FIX 2: Use csvEscape() to handle double-quote characters in field values
    const csv = [headers, ...rows]
      .map(row => row.map(csvEscape).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment_report_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting payment report:', error.message);
    res.status(500).json({ message: 'Failed to export payment report' });
  }
});

module.exports = router;