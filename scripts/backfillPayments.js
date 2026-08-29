/**
 * NEW — one-time backfill for the payment ledger (models/Payment.js).
 *
 * Every Invoice created BEFORE this change has a paidAmount but no
 * individual Payment records behind it — there's no itemized history for
 * how that number was reached (was it one advance charge? a cash
 * collection? multiple partial payments?). This script creates ONE
 * synthetic Payment per existing invoice with paidAmount > 0, tagged as a
 * backfill entry, so recomputeInvoiceAmounts (utils/paymentLedger.js)
 * reconciles against the ledger correctly for old data too, instead of
 * treating every pre-migration invoice as if nothing had ever been paid.
 *
 * This does NOT try to reconstruct real history (there isn't any to
 * reconstruct) — it's one lump-sum entry per invoice, clearly labeled as
 * such, so the ledger's running total is correct from this point forward.
 * Anything that happens to an invoice AFTER this script runs (a refund, a
 * balance settlement) goes through recordPayment() as its own real,
 * itemized entry same as any new invoice.
 *
 * NOT run automatically — there's no live database reachable from the
 * sandbox this was built in. Run this yourself, once, against your real
 * database, after deploying the rest of this change:
 *
 *   node scripts/backfillPayments.js            (dry run — reports only)
 *   node scripts/backfillPayments.js --apply     (actually writes)
 *
 * Safe to re-run: an invoice that already has a Payment record tagged
 * with note "Backfilled..." is skipped, so running this twice doesn't
 * double-count.
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');

const BACKFILL_NOTE = 'Backfilled from pre-migration paidAmount — no itemized payment history available for this invoice.';

async function run() {
  const apply = process.argv.includes('--apply');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI (or MONGO_URI) not set in backend/.env — cannot connect.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply to write)'}\n`);

  const invoices = await Invoice.find({ paidAmount: { $gt: 0 } });
  console.log(`Found ${invoices.length} invoice(s) with paidAmount > 0.\n`);

  let created = 0;
  let skippedAlready = 0;
  let skippedNoBooking = 0;

  for (const invoice of invoices) {
    const alreadyBackfilled = await Payment.findOne({ invoiceId: invoice._id, note: BACKFILL_NOTE });
    if (alreadyBackfilled) {
      skippedAlready++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(invoice.bookingId)) {
      console.warn(`  SKIP ${invoice.invoiceNumber} — bookingId is not a valid ObjectId (legacy data), can't link a Payment record.`);
      skippedNoBooking++;
      continue;
    }

    console.log(`  ${apply ? 'CREATE' : '[dry] would create'} — ${invoice.invoiceNumber}: Rs. ${invoice.paidAmount} (${invoice.paymentMethod || 'unknown method'})`);

    if (apply) {
      // Best-effort method guess from the invoice's own paymentMethod label
      // — this is a backfill entry, so the exact method matters far less
      // than the amount reconciling; default to 'online' when genuinely
      // unclear rather than leaving it unset (method is required).
      const rawMethod = (invoice.paymentMethod || '').toLowerCase();
      const method = rawMethod.includes('cod') ? 'cod'
        : rawMethod.includes('cash') ? 'cash'
        : rawMethod.includes('advance') ? 'advance'
        : rawMethod.includes('after completion') ? 'pay-after-completion'
        : 'online';

      const customerId = mongoose.Types.ObjectId.isValid(invoice.customer?.userId) ? invoice.customer.userId : undefined;

      await Payment.create({
        invoiceId: invoice._id,
        bookingId: invoice.bookingId,
        customerId,
        amount: invoice.paidAmount,
        direction: 'CHARGE',
        method,
        status: 'paid',
        label: 'Backfilled opening balance',
        paidAt: invoice.createdAt || new Date(),
        note: BACKFILL_NOTE,
      });
    }
    created++;
  }

  console.log(`\n${apply ? 'Created' : 'Would create'}: ${created}`);
  console.log(`Already backfilled (skipped): ${skippedAlready}`);
  console.log(`Skipped — invalid bookingId (legacy data): ${skippedNoBooking}`);
  if (!apply) {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply to write these records.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
