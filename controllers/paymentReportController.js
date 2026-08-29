const mongoose = require('mongoose');

/**
 * Payment Report Controller
 * Handles payment report queries, filtering, and export (CSV/PDF)
 */

// Sample aggregation pipeline for payment reports
const getPaymentReports = async (req, res) => {
  try {
    const { startDate, endDate, status, method, page = 1, limit = 10 } = req.query;

    // FIX (task #17): $lte on a bare `new Date(endDate)` resolves to
    // midnight (00:00:00) on the end date, so any payment created later
    // that same day was silently excluded from the report. Extending to
    // the last instant of the end date includes the full day.
    const matchStage = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(`${endDate}T23:59:59.999`),
      },
    };

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;

    // Aggregate payments with related invoice and booking data
    const payments = await mongoose.connection
      .collection('payments')
      .aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'invoices',
            localField: 'invoiceId',
            foreignField: '_id',
            as: 'invoice',
          },
        },
        {
          $lookup: {
            from: 'bookings',
            localField: 'bookingId',
            foreignField: '_id',
            as: 'booking',
          },
        },
        { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            paymentId: '$_id',
            invoiceNumber: '$invoice.invoiceNumber',
            bookingId: '$bookingId',
            customerName: '$booking.customerName',
            amount: 1,
            method: 1,
            status: 1,
            paidAt: 1,
            createdAt: 1,
            gatewayId: 1,
          },
        },
        { $skip: (page - 1) * limit },
        { $limit: parseInt(limit) },
      ])
      .toArray();

    // Calculate totals
    const totalsResult = await mongoose.connection
      .collection('payments')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            paid: {
              $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const totals = totalsResult[0] || { total: 0, paid: 0, pending: 0, count: 0 };

    res.json({
      success: true,
      data: payments,
      totals: {
        total: totals.total.toFixed(2),
        paid: totals.paid.toFixed(2),
        pending: totals.pending.toFixed(2),
        count: totals.count,
      },
      page: parseInt(page),
      pageSize: parseInt(limit),
    });
  } catch (error) {
    console.error('Error fetching payment reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment reports' });
  }
};

// Export payment reports as CSV
const exportPaymentReportCSV = async (req, res) => {
  try {
    const { startDate, endDate, status, method } = req.query;

    // FIX (task #17): $lte on a bare `new Date(endDate)` resolves to
    // midnight (00:00:00) on the end date, so any payment created later
    // that same day was silently excluded from the report. Extending to
    // the last instant of the end date includes the full day.
    const matchStage = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(`${endDate}T23:59:59.999`),
      },
    };

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;

    const payments = await mongoose.connection
      .collection('payments')
      .aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'invoices',
            localField: 'invoiceId',
            foreignField: '_id',
            as: 'invoice',
          },
        },
        {
          $lookup: {
            from: 'bookings',
            localField: 'bookingId',
            foreignField: '_id',
            as: 'booking',
          },
        },
        { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            paymentId: '$_id',
            invoiceNumber: '$invoice.invoiceNumber',
            bookingId: '$bookingId',
            customerName: '$booking.customerName',
            amount: 1,
            method: 1,
            status: 1,
            paidAt: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray();

    const csvHeader = ['Payment ID', 'Invoice', 'Booking', 'Customer', 'Amount', 'Method', 'Status', 'Paid At', 'Created At'];
    const csvRows = payments.map((p) => [
      p.paymentId.toString(),
      p.invoiceNumber || 'N/A',
      p.bookingId || 'N/A',
      p.customerName || 'N/A',
      p.amount.toFixed(2),
      p.method,
      p.status,
      p.paidAt ? new Date(p.paidAt).toISOString().split('T')[0] : 'N/A',
      new Date(p.createdAt).toISOString().split('T')[0],
    ]);

    const csv = [
      csvHeader.map((h) => `"${h}"`).join(','),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment-report-${startDate}-to-${endDate}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to export payment report CSV' });
  }
};

// Export payment reports as PDF (requires pdfkit or similar)
const exportPaymentReportPDF = async (req, res) => {
  try {
    const { startDate, endDate, status, method } = req.query;
    const PDFDocument = require('pdfkit');

    // FIX (task #17): $lte on a bare `new Date(endDate)` resolves to
    // midnight (00:00:00) on the end date, so any payment created later
    // that same day was silently excluded from the report. Extending to
    // the last instant of the end date includes the full day.
    const matchStage = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(`${endDate}T23:59:59.999`),
      },
    };

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;

    const payments = await mongoose.connection
      .collection('payments')
      .aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'invoices',
            localField: 'invoiceId',
            foreignField: '_id',
            as: 'invoice',
          },
        },
        {
          $lookup: {
            from: 'bookings',
            localField: 'bookingId',
            foreignField: '_id',
            as: 'booking',
          },
        },
        { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payment-report-${startDate}-to-${endDate}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).text('Payment Report', { align: 'center' });
    doc.fontSize(10).text(`From: ${startDate} To: ${endDate}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text('Summary', { underline: true });
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const paid = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    doc.fontSize(10).text(`Total: $${total.toFixed(2)} | Paid: $${paid.toFixed(2)}`);
    doc.moveDown();

    doc.fontSize(12).text('Payments', { underline: true });
    doc.fontSize(8);
    payments.forEach((p) => {
      doc.text(
        `${p.paymentId} | ${p.invoice?.invoiceNumber || 'N/A'} | ${p.booking?.customerName || 'N/A'} | $${p.amount.toFixed(2)} | ${p.status}`
      );
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ success: false, error: 'Failed to export payment report PDF' });
  }
};

// Reconciliation report (admin dashboard view)
const getReconciliationReport = async (req, res) => {
  try {
    const reconciliation = await mongoose.connection
      .collection('payments')
      .aggregate([
        {
          $group: {
            _id: '$method',
            totalCount: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            method: '$_id',
            _id: 0,
            totalCount: 1,
            totalAmount: 1,
            paidCount: 1,
            pendingCount: 1,
            failedCount: 1,
          },
        },
      ])
      .toArray();

    res.json({ success: true, data: reconciliation });
  } catch (error) {
    console.error('Error fetching reconciliation report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reconciliation report' });
  }
};

module.exports = {
  getPaymentReports,
  exportPaymentReportCSV,
  exportPaymentReportPDF,
  getReconciliationReport,
};
