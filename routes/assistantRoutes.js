const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { protect } = require('../middleware/authMiddleware');
const Invoice        = require('../models/Invoice');
const Booking        = require('../models/Booking');
const Refund          = require('../models/Refund');
const PriceReduction  = require('../models/PriceReduction');

// Ported from backend-payment-workflow, rewritten to use the official
// @anthropic-ai/sdk instead of raw fetch(), and adapted to query this repo's
// actual schemas — the source branch's tool implementations assumed a
// different Booking shape (b.email instead of b.customerEmail, uppercase
// status instead of this repo's lowercase, a serviceItems array Booking
// doesn't have, an advanceAmount field that doesn't exist) and a different
// Refund shape (r.invoice populated ref, r.refundedAmount) than this repo's
// actual Refund model (bookingRef string, amount).

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// ── Business knowledge system prompt ─────────────────────────────────────────
const SYSTEM_PROMPT = `You are a smart internal assistant for Cloud Laundry.lk, a professional cleaning company in Sri Lanka. You help admin staff and managers understand the business, find information about customers and invoices, and navigate workflows.

BUSINESS OVERVIEW:
Cloud Laundry.lk offers four types of cleaning services:
- Home/Office Cleaning (HOC): Deep cleaning, kitchen, bathroom cleaning
- Laundry (LND): Wash & fold, wash & iron, ironing
- Shampoo/Vacuum (SVC): Sofa, carpet, mattress, chair shampooing
- Curtain Cleaning (CUR): On-site steam, dry cleaning

INVOICE LIFECYCLE:
DRAFT → (admin approves) → SENT → (customer pays) → PAID
                                                    → PARTIAL (advance paid, balance owed)
Special states: REFUND_PENDING, REFUNDED, CANCELLED

HOW STAFF CREATES INVOICES:
Staff use StaffInvoicePage. All staff-created invoices start as DRAFT.
Admin must approve in the Financial Dashboard. On approval, status → SENT and an invoice email is sent to the customer automatically.

HOW ONLINE PAYMENTS WORK:
Customer books → selects payment method → redirected to PayHere → PayHere calls /api/payhere/notify (IPN webhook) → backend validates MD5 hash → invoice updated to PAID or PARTIAL.

HOW REFUNDS WORK:
Customer requests refund (with reason) → status → REFUND_PENDING → Admin approves in the Financial Dashboard → invoice updated to REFUNDED.

HOW PRICE REDUCTIONS WORK:
Customer requests a reduction with reason and amount → Admin reviews and approves or rejects.

INVOICE PREFIXES:
LND = Laundry, CUR = Curtain, SVC = Shampoo/Vacuum, HOC = Home/Office, MULTI = mixed services, GEN = unrecognised

AVAILABLE TOOLS:
You have tools to query live data. Use them when the user asks about specific invoices, customers, amounts, or statuses. Always explain results in plain English — never dump raw JSON at the user.

TONE:
Be concise, friendly, and helpful. Use bullet points for lists. When showing money amounts, format as "Rs. X,XXX". When showing dates, use human-readable format. If you don't know something, say so honestly.`;

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search_invoices',
    description: 'Search invoices by status, customer name, date range, or invoice number. Use this to answer questions like "show me unpaid invoices", "find Kavya\'s invoice", "how many DRAFT invoices are there".',
    input_schema: {
      type: 'object',
      properties: {
        status:        { type: 'string', description: 'Filter by status: DRAFT, SENT, PAID, PARTIAL, REFUND_PENDING, REFUNDED, CANCELLED' },
        customerName:  { type: 'string', description: 'Partial customer name search' },
        invoiceNumber: { type: 'string', description: 'Exact invoice number e.g. HOC-20260606-0001' },
        fromDate:      { type: 'string', description: 'Start date ISO format YYYY-MM-DD' },
        toDate:        { type: 'string', description: 'End date ISO format YYYY-MM-DD' },
        limit:         { type: 'number', description: 'Max results to return (default 10, max 20)' },
      },
    },
  },
  {
    name: 'get_invoice_stats',
    description: 'Get financial summary stats: total revenue, pending balances, invoice counts by status, refund totals. Use for questions like "how much have we collected this week", "how many invoices are pending".',
    input_schema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date ISO format YYYY-MM-DD' },
        toDate:   { type: 'string', description: 'End date ISO format YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'search_bookings',
    description: 'Search bookings by status, customer email, or booking ID. Use for questions about specific bookings or booking statuses.',
    input_schema: {
      type: 'object',
      properties: {
        status:    { type: 'string', description: 'pending, confirmed, in-progress, completed, cancelled' },
        email:     { type: 'string', description: 'Customer email address' },
        bookingId: { type: 'string', description: 'Exact booking ID' },
        limit:     { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'get_customer_history',
    description: 'Get all invoices and bookings for a specific customer by name or email. Use for "show me everything about Kavya" or "what has this customer ordered".',
    input_schema: {
      type: 'object',
      properties: {
        customerName:  { type: 'string', description: 'Customer full or partial name' },
        customerEmail: { type: 'string', description: 'Customer email address' },
      },
      required: [],
    },
  },
  {
    name: 'get_pending_approvals',
    description: 'Get all DRAFT invoices waiting for admin approval. Use for "what needs my attention", "show pending approvals".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_refunds',
    description: 'Get pending refund requests or recent refunds. Use for "show me refund requests", "who has requested a refund".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'pending, approved, rejected — leave empty for all' },
      },
    },
  },
  {
    name: 'get_outstanding_balances',
    description: 'Get all invoices with outstanding balance amounts (PARTIAL status). Use for "who still owes money", "outstanding balance this month".',
    input_schema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Optional start date' },
        toDate:   { type: 'string', description: 'Optional end date' },
      },
    },
  },
];

// ── Simple status endpoint so the frontend can gracefully disable its UI ──────
// @route GET /api/assistant/status
router.get('/status', (req, res) => {
  const disabled = process.env.DISABLE_AI === 'true' || !process.env.ANTHROPIC_API_KEY;
  res.json({
    enabled: !disabled,
    disabledReason: disabled ? (process.env.DISABLE_AI === 'true' ? 'disabled_by_server' : 'missing_anthropic_key') : null,
  });
});

// ── Tool execution ─────────────────────────────────────────────────────────────
const executeTool = async (toolName, toolInput) => {
  try {
    switch (toolName) {

      case 'search_invoices': {
        const query = {};
        if (toolInput.status)        query.status = toolInput.status.toUpperCase();
        if (toolInput.invoiceNumber) query.invoiceNumber = toolInput.invoiceNumber;
        if (toolInput.customerName)  query['customer.name'] = { $regex: toolInput.customerName, $options: 'i' };
        if (toolInput.fromDate || toolInput.toDate) {
          query.createdAt = {};
          if (toolInput.fromDate) query.createdAt.$gte = new Date(toolInput.fromDate);
          if (toolInput.toDate)   query.createdAt.$lte = new Date(toolInput.toDate + 'T23:59:59');
        }
        const invoices = await Invoice.find(query).sort({ createdAt: -1 }).limit(Math.min(toolInput.limit || 10, 20)).lean();

        return {
          count: invoices.length,
          invoices: invoices.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            customer:      inv.customer?.name,
            email:         inv.customer?.email,
            status:        inv.status,
            invoiceType:   inv.invoiceType,
            totalAmount:   inv.totalAmount,
            paidAmount:    inv.paidAmount,
            balanceAmount: inv.balanceAmount,
            date:          inv.createdAt,
            bookingId:     inv.bookingId,
          })),
        };
      }

      case 'get_invoice_stats': {
        const match = {};
        if (toolInput.fromDate || toolInput.toDate) {
          match.createdAt = {};
          if (toolInput.fromDate) match.createdAt.$gte = new Date(toolInput.fromDate);
          if (toolInput.toDate)   match.createdAt.$lte = new Date(toolInput.toDate + 'T23:59:59');
        }

        const [invoices, statusBreakdown] = await Promise.all([
          Invoice.find(match).lean(),
          Invoice.aggregate([
            { $match: match },
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } },
          ]),
        ]);

        return {
          totalInvoices:  invoices.length,
          totalRevenue:   invoices.filter(i => ['PAID', 'PARTIAL'].includes(i.status)).reduce((s, i) => s + i.paidAmount, 0),
          totalInvoiced:  invoices.reduce((s, i) => s + i.totalAmount, 0),
          totalPending:   invoices.filter(i => i.status === 'PARTIAL').reduce((s, i) => s + i.balanceAmount, 0),
          totalRefunded:  invoices.filter(i => i.status === 'REFUNDED').reduce((s, i) => s + i.totalAmount, 0),
          draftCount:     invoices.filter(i => i.status === 'DRAFT').length,
          refundPending:  invoices.filter(i => i.status === 'REFUND_PENDING').length,
          byStatus: statusBreakdown.map(s => ({ status: s._id, count: s.count, totalAmount: s.total, paidAmount: s.paid })),
        };
      }

      case 'search_bookings': {
        const query = {};
        // FIX: this repo's Booking.status is lowercase ('confirmed'), not uppercase.
        if (toolInput.status)    query.status        = toolInput.status.toLowerCase();
        // FIX: field is customerEmail, not email.
        if (toolInput.email)     query.customerEmail = { $regex: toolInput.email, $options: 'i' };
        if (toolInput.bookingId) query.bookingId     = toolInput.bookingId;

        const bookings = await Booking.find(query).sort({ createdAt: -1 }).limit(Math.min(toolInput.limit || 10, 20)).lean();

        return {
          count: bookings.length,
          bookings: bookings.map(b => ({
            bookingId:     b.bookingId,
            customerEmail: b.customerEmail,
            status:        b.status,
            date:          b.date,
            time:          b.time,
            address:       b.address,
            price:         b.price,
            paidAmount:    b.paidAmount,
            balanceAmount: b.balanceAmount,
            serviceName:   b.serviceName,
          })),
        };
      }

      case 'get_customer_history': {
        const invoiceQuery = {};
        const bookingQuery = {};
        if (toolInput.customerName) {
          invoiceQuery['customer.name'] = { $regex: toolInput.customerName, $options: 'i' };
          bookingQuery.customerName    = { $regex: toolInput.customerName, $options: 'i' };
        }
        if (toolInput.customerEmail) {
          invoiceQuery['customer.email'] = { $regex: toolInput.customerEmail, $options: 'i' };
          bookingQuery.customerEmail    = { $regex: toolInput.customerEmail, $options: 'i' };
        }

        const [invoices, bookings] = await Promise.all([
          Invoice.find(invoiceQuery).sort({ createdAt: -1 }).limit(10).lean(),
          Booking.find(bookingQuery).sort({ createdAt: -1 }).limit(10).lean(),
        ]);

        return {
          invoiceCount: invoices.length,
          bookingCount: bookings.length,
          totalSpent:   invoices.reduce((s, i) => s + i.paidAmount, 0),
          invoices: invoices.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            status:        inv.status,
            totalAmount:   inv.totalAmount,
            paidAmount:    inv.paidAmount,
            balanceAmount: inv.balanceAmount,
            date:          inv.createdAt,
          })),
          bookings: bookings.map(b => ({
            bookingId: b.bookingId,
            status:    b.status,
            date:      b.date,
            service:   b.serviceName,
          })),
        };
      }

      case 'get_pending_approvals': {
        const drafts = await Invoice.find({ status: 'DRAFT' }).sort({ createdAt: -1 }).lean();
        return {
          count: drafts.length,
          invoices: drafts.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            customer:      inv.customer?.name,
            totalAmount:   inv.totalAmount,
            createdAt:     inv.createdAt,
            bookingId:     inv.bookingId,
          })),
        };
      }

      case 'get_refunds': {
        // FIX: this repo's Refund model uses lowercase status, bookingRef
        // (a plain string, not a populated `invoice` ref), and `amount` (not
        // `refundedAmount`) — the source branch's shape doesn't match.
        const query = {};
        if (toolInput.status) query.status = toolInput.status.toLowerCase();

        const refunds = await Refund.find(query).sort({ createdAt: -1 }).limit(15).lean();

        return {
          count: refunds.length,
          refunds: refunds.map(r => ({
            refundId:     r._id,
            status:       r.status,
            reason:       r.reason,
            amount:       r.amount,
            bookingRef:   r.bookingRef,
            customerName: r.customerName,
            createdAt:    r.createdAt,
          })),
        };
      }

      case 'get_outstanding_balances': {
        const match = { status: 'PARTIAL', balanceAmount: { $gt: 0 } };
        if (toolInput.fromDate || toolInput.toDate) {
          match.createdAt = {};
          if (toolInput.fromDate) match.createdAt.$gte = new Date(toolInput.fromDate);
          if (toolInput.toDate)   match.createdAt.$lte = new Date(toolInput.toDate + 'T23:59:59');
        }

        const invoices = await Invoice.find(match).sort({ createdAt: -1 }).lean();

        return {
          count: invoices.length,
          totalOutstanding: invoices.reduce((s, i) => s + i.balanceAmount, 0),
          invoices: invoices.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            customer:      inv.customer?.name,
            email:         inv.customer?.email,
            totalAmount:   inv.totalAmount,
            paidAmount:    inv.paidAmount,
            balanceAmount: inv.balanceAmount,
            date:          inv.createdAt,
          })),
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err.message);
    return { error: err.message };
  }
};

// ── Main assistant route ───────────────────────────────────────────────────────
// @route   POST /api/assistant/chat
// @access  Private (admin/staff)
router.post('/chat', protect, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ msg: 'messages array is required.' });
  }
  if (process.env.DISABLE_AI === 'true') {
    return res.status(503).json({ msg: 'AI features are disabled on this server.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ msg: 'AI assistant is not available (Anthropic key missing).' });
  }

  try {
    let currentMessages = [...messages];

    // Agentic loop: Claude may call tools multiple times before giving a final answer.
    while (true) {
      const response = await client.messages.create({
        model:      'claude-opus-5',
        max_tokens: 4096,
        system:     SYSTEM_PROMPT,
        tools:      TOOLS,
        messages:   currentMessages,
      });

      if (response.stop_reason === 'end_turn') {
        const textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        return res.json({ reply: textContent, usage: response.usage });
      }

      if (response.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: response.content });

        const toolResults = await Promise.all(
          response.content
            .filter(c => c.type === 'tool_use')
            .map(async (toolUse) => {
              const result = await executeTool(toolUse.name, toolUse.input);
              return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) };
            })
        );

        currentMessages.push({ role: 'user', content: toolResults });
        // loop continues
      } else {
        const fallback = response.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
        return res.json({ reply: fallback || 'I was unable to complete that request.', usage: response.usage });
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', err.status, err.message);
      return res.status(502).json({ msg: 'AI service error.', details: err.message });
    }
    console.error('Assistant route error:', err.message);
    res.status(500).json({ msg: 'Server error processing your request.' });
  }
});

module.exports = router;
