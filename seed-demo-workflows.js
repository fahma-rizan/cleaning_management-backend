/**
 * SEED DEMO WORKFLOW DATA
 * ─────────────────────────────────────────────────────────────────────────
 * Creates one realistic example of every payment/invoice/notification
 * workflow state you'd want to show in a live demo: all 4 payment methods,
 * an Advance+Balance booking settled through the just-fixed -BAL linking,
 * a loyalty-points redemption, a pending and an approved refund, a pending
 * and an approved price reduction, and a spread of notifications.
 *
 * Uses the REAL Mongoose models (not raw collection.insertOne like
 * seed-test-data.js), so bookingId/invoiceNumber come from the actual
 * Counter-based generators — these are exactly the documents the real app
 * would produce, not look-alikes.
 *
 * Usage:
 *   node seed-demo-workflows.js
 *   (reads MONGO_URI / MONGODB_URI from .env, same as the server)
 *
 * To remove everything this script created:
 *   CLEANUP=true node seed-demo-workflows.js
 *
 * Everything created here is tagged so it's safe to re-run and safe to
 * clean up without touching real data: every demo customer's email ends
 * in "@demo.cloudlaundry.lk".
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// FIX: prefer MONGODB_URI first — server.js connects with MONGODB_URI, and
// on at least one real run MONGO_URI (present but apparently stale/rotated
// credentials in this .env) caused a 30s server-selection timeout while
// MONGODB_URI connected instantly for the exact same server. Matching
// server.js's own precedence so this script always uses whichever one is
// actually known to work.
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const CLEANUP   = process.env.CLEANUP === 'true';

if (!MONGO_URI) {
  console.error('❌ Set MONGO_URI or MONGODB_URI in your .env first.');
  process.exit(1);
}

const User           = require('./models/User');
const Booking         = require('./models/Booking');
const Invoice         = require('./models/Invoice');
const Refund          = require('./models/Refund');
const PriceReduction  = require('./models/PriceReduction');
const Notification    = require('./models/Notification');
const { determineInvoiceDetails, generateInvoiceNumber } = require('./utils/invoiceUtils');

const DEMO_EMAIL_DOMAIN = '@demo.cloudlaundry.lk';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

async function cleanup() {
  console.log('🧹 Removing all demo-seeded data...');
  const demoUsers = await User.find({ email: { $regex: DEMO_EMAIL_DOMAIN + '$' } });
  const userIds = demoUsers.map(u => u._id);
  const bookings = await Booking.find({ customerId: { $in: userIds } });
  const bookingIds = bookings.map(b => b._id);
  const invoices = await Invoice.find({ bookingId: { $in: bookingIds } });
  const invoiceIds = invoices.map(i => i._id);

  await Refund.deleteMany({ invoice: { $in: invoiceIds } });
  await PriceReduction.deleteMany({ invoice: { $in: invoiceIds } });
  await Invoice.deleteMany({ _id: { $in: invoiceIds } });
  await Notification.deleteMany({ userId: { $in: userIds.map(String) } });
  await Booking.deleteMany({ _id: { $in: bookingIds } });
  await User.deleteMany({ _id: { $in: userIds } });

  console.log(`✅ Removed ${userIds.length} demo user(s), ${bookingIds.length} booking(s), ${invoiceIds.length} invoice(s).`);
}

// Creates the customer.userId sub-document, an Invoice, and (for the online
// methods) the matching Notification — mirrors what payhere.js /notify and
// routes/booking.js actually create, so the demo data behaves exactly like
// the real flow would in every dashboard/report.
async function makeInvoice({ booking, customer, invoiceType, isBalanceInvoice, parentInvoiceId, invoiceNumberOverride,
                              totalAmount, paidAmount, balanceAmount, paymentMethod, status,
                              loyaltyPointsUsed = 0, loyaltyDiscount = 0, payherePaymentId, daysOld = 0 }) {
  const { prefix, categories } = determineInvoiceDetails(booking.serviceItems);
  const invoiceNumber = invoiceNumberOverride || await generateInvoiceNumber(prefix);

  const invoice = new Invoice({
    invoiceNumber,
    invoiceType,
    isBalanceInvoice: !!isBalanceInvoice,
    parentInvoiceId,
    mainCategories: categories,
    bookingId: booking._id,
    customer: {
      userId: customer._id, name: customer.firstName + ' ' + customer.lastName,
      email: customer.email, address: booking.address,
    },
    serviceItems: booking.serviceItems,
    subTotal: totalAmount,
    totalAmount,
    paidAmount,
    balanceAmount,
    loyaltyPointsUsed,
    loyaltyDiscount,
    paymentMethod,
    payherePaymentId,
    status,
    history: [{ event: 'DEMO_SEEDED', details: `Seeded for live demo (${paymentMethod})`, timestamp: new Date() }],
  });
  invoice.createdAt = new Date(Date.now() - daysOld * 86400000);
  await invoice.save({ validateBeforeSave: true });
  return invoice;
}

async function notify(customer, { type, title, message, bookingId }) {
  await new Notification({
    userId: customer._id.toString(), type, title, message, bookingId,
  }).save();
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  if (CLEANUP) {
    await cleanup();
    await mongoose.disconnect();
    return;
  }

  // One demo customer per scenario keeps the "Customers" analytics tab
  // interesting too, instead of one account owning everything.
  async function demoCustomer(n, first) {
    const email = `demo${n}${DEMO_EMAIL_DOMAIN}`;
    let user = await User.findOne({ email });
    if (!user) {
      user = await new User({
        firstName: first, lastName: `Demo${n}`, email,
        password: '$2a$10$demoSeedPasswordHashPlaceholder000000000000000000000',
        role: 'customer', isVerified: true, isActive: true,
      }).save();
    }
    return user;
  }

  console.log('── 1/4 Full Online ─────────────────────────────────────────');

  // 1a. Full Online, paid in full, no loyalty.
  const c1 = await demoCustomer(1, 'Nadeesha');
  const b1 = await new Booking({
    customerId: c1._id, customerName: `${c1.firstName} ${c1.lastName}`, customerEmail: c1.email,
    serviceName: 'Home Cleaning', serviceItems: [{ name: 'Home Cleaning', price: 5000, quantity: 1 }],
    date: daysAgo(6), time: '9:00AM - 11:00AM', address: '12 Galle Road, Colombo 03',
    price: 5000, paidAmount: 5000, balanceAmount: 0,
    paymentMethod: 'full-online', status: 'confirmed',
  }).save();
  const i1 = await makeInvoice({
    booking: b1, customer: c1, invoiceType: 'FULL', totalAmount: 5000, paidAmount: 5000, balanceAmount: 0,
    paymentMethod: 'Full Online', status: 'PAID', payherePaymentId: 'DEMO-PH-1001', daysOld: 6,
  });
  await notify(c1, { type: 'payment', title: 'Payment Successful', message: `Your payment of LKR 5000.00 for booking ${b1.bookingId} was successful.`, bookingId: b1.bookingId });
  console.log(`  ${b1.bookingId} / ${i1.invoiceNumber} — Full Online, PAID`);

  // 1b. Full Online, paid using loyalty points (A.2 demo).
  const c2 = await demoCustomer(2, 'Ruwan');
  const b2 = await new Booking({
    customerId: c2._id, customerName: `${c2.firstName} ${c2.lastName}`, customerEmail: c2.email,
    serviceName: 'Curtain Cleaning', serviceItems: [{ name: 'Curtain Cleaning', price: 4000, quantity: 1 }],
    date: daysAgo(4), time: '2:00PM - 4:00PM', address: '45 Kandy Road, Kadawatha',
    price: 4000, paidAmount: 3700, balanceAmount: 0,
    paymentMethod: 'full-online', status: 'confirmed',
  }).save();
  const i2 = await makeInvoice({
    booking: b2, customer: c2, invoiceType: 'FULL', totalAmount: 4000, paidAmount: 3700, balanceAmount: 0,
    paymentMethod: 'Full Online', status: 'PAID', payherePaymentId: 'DEMO-PH-1002',
    loyaltyPointsUsed: 300, loyaltyDiscount: 300, daysOld: 4,
  });
  await notify(c2, { type: 'payment', title: 'Payment Successful', message: `Your payment of LKR 3700.00 for booking ${b2.bookingId} was successful (300 points redeemed).`, bookingId: b2.bookingId });
  console.log(`  ${b2.bookingId} / ${i2.invoiceNumber} — Full Online + loyalty discount, PAID`);

  console.log('\n── 2/4 Advance + Balance ───────────────────────────────────');

  // 2a. Advance paid, balance still outstanding — an in-flight booking.
  const c3 = await demoCustomer(3, 'Ishara');
  const b3 = await new Booking({
    customerId: c3._id, customerName: `${c3.firstName} ${c3.lastName}`, customerEmail: c3.email,
    serviceName: 'Deep Cleaning', serviceItems: [{ name: 'Deep Cleaning', price: 10000, quantity: 1 }],
    date: daysFromNow(2), time: '10:00AM - 1:00PM', address: '7 Marine Drive, Colombo 06',
    price: 10000, paidAmount: 2000, balanceAmount: 8000,
    paymentMethod: 'advance-balance', status: 'confirmed',
  }).save();
  const i3 = await makeInvoice({
    booking: b3, customer: c3, invoiceType: 'ADVANCE', totalAmount: 10000, paidAmount: 2000, balanceAmount: 8000,
    paymentMethod: 'Advance + Balance', status: 'PARTIAL', payherePaymentId: 'DEMO-PH-1003', daysOld: 1,
  });
  await notify(c3, { type: 'payment', title: 'Advance Payment Received', message: `Your 20% advance of LKR 2000.00 for booking ${b3.bookingId} was received. Balance due: LKR 8000.00.`, bookingId: b3.bookingId });
  console.log(`  ${b3.bookingId} / ${i3.invoiceNumber} — Advance+Balance, PARTIAL (balance still due — good "in progress" example)`);

  // 2b. Advance paid, balance settled in cash at completion — exercises the
  //     just-fixed -BAL linking end to end.
  const c4 = await demoCustomer(4, 'Sanduni');
  const b4 = await new Booking({
    customerId: c4._id, customerName: `${c4.firstName} ${c4.lastName}`, customerEmail: c4.email,
    serviceName: 'Sofa Cleaning', serviceItems: [{ name: 'Sofa Cleaning', price: 8000, quantity: 1 }],
    date: daysAgo(3), time: '3:00PM - 5:00PM', address: '9 Havelock Road, Colombo 05',
    price: 8000, paidAmount: 8000, balanceAmount: 0,
    paymentMethod: 'advance-balance', status: 'completed',
    balanceSettledVia: 'cash', balancePaid: true,
  }).save();
  const i4a = await makeInvoice({
    booking: b4, customer: c4, invoiceType: 'ADVANCE', totalAmount: 8000, paidAmount: 1600, balanceAmount: 0,
    paymentMethod: 'Advance + Balance', status: 'PARTIAL', payherePaymentId: 'DEMO-PH-1004', daysOld: 3,
  });
  const i4b = await makeInvoice({
    booking: b4, customer: c4, invoiceType: 'FINAL', isBalanceInvoice: true, parentInvoiceId: i4a._id,
    invoiceNumberOverride: `${i4a.invoiceNumber}-BAL`,
    totalAmount: 6400, paidAmount: 6400, balanceAmount: 0,
    paymentMethod: 'Advance + Balance (Cash)', status: 'PAID', daysOld: 0,
  });
  await notify(c4, { type: 'order-completed', title: 'Service Complete — Balance Settled', message: `Your ${b4.serviceName} is complete. Balance of LKR 6400.00 collected on-site.`, bookingId: b4.bookingId });
  console.log(`  ${b4.bookingId} / ${i4a.invoiceNumber} + ${i4b.invoiceNumber} — Advance+Balance fully settled (real -BAL linking, isBalanceInvoice=true)`);

  console.log('\n── 3/4 Cash on Delivery ────────────────────────────────────');

  // 3a. COD, not yet completed — no invoice yet (per spec A.5).
  const c5 = await demoCustomer(5, 'Damith');
  const b5 = await new Booking({
    customerId: c5._id, customerName: `${c5.firstName} ${c5.lastName}`, customerEmail: c5.email,
    serviceName: 'Mattress Cleaning', serviceItems: [{ name: 'Mattress Cleaning', price: 3500, quantity: 1 }],
    date: daysFromNow(3), time: '11:00AM - 1:00PM', address: '22 High Level Road, Nugegoda',
    price: 3500, paidAmount: 0, balanceAmount: 3500,
    paymentMethod: 'cod', status: 'pending',
  }).save();
  await notify(c5, { type: 'order-confirmed', title: 'Booking Confirmed! 🎉', message: `Your ${b5.serviceName} service is scheduled for ${b5.date} at ${b5.time}. Booking ID: ${b5.bookingId}`, bookingId: b5.bookingId });
  console.log(`  ${b5.bookingId} — COD, upcoming, no invoice yet (correct per spec — invoice comes at completion)`);

  // 3b. COD, completed — invoice auto-PAID.
  const c6 = await demoCustomer(6, 'Hansika');
  const b6 = await new Booking({
    customerId: c6._id, customerName: `${c6.firstName} ${c6.lastName}`, customerEmail: c6.email,
    serviceName: 'Carpet Cleaning', serviceItems: [{ name: 'Carpet Cleaning', price: 4500, quantity: 1 }],
    date: daysAgo(2), time: '9:00AM - 11:00AM', address: '5 Baseline Road, Colombo 09',
    price: 4500, paidAmount: 4500, balanceAmount: 0,
    paymentMethod: 'cod', status: 'completed', balancePaid: true,
  }).save();
  const i6 = await makeInvoice({
    booking: b6, customer: c6, invoiceType: 'COD', totalAmount: 4500, paidAmount: 4500, balanceAmount: 0,
    paymentMethod: 'Cash on Delivery', status: 'PAID', daysOld: 2,
  });
  await notify(c6, { type: 'order-completed', title: 'Service Complete', message: `Your ${b6.serviceName} is complete. LKR 4500.00 collected on-site.`, bookingId: b6.bookingId });
  console.log(`  ${b6.bookingId} / ${i6.invoiceNumber} — COD, completed, auto-PAID`);

  console.log('\n── 4/4 Pay After Completion ─────────────────────────────────');

  // 4a. Completed, invoice UNPAID — awaiting the customer to pay the link.
  const c7 = await demoCustomer(7, 'Kasun');
  const b7 = await new Booking({
    customerId: c7._id, customerName: `${c7.firstName} ${c7.lastName}`, customerEmail: c7.email,
    serviceName: 'Laundry', serviceItems: [{ name: 'Laundry', price: 2200, quantity: 1 }],
    date: daysAgo(1), time: '4:00PM - 6:00PM', address: '18 Union Place, Colombo 02',
    price: 2200, paidAmount: 0, balanceAmount: 2200,
    paymentMethod: 'pay-after-completion', status: 'completed',
  }).save();
  const i7 = await makeInvoice({
    booking: b7, customer: c7, invoiceType: 'FINAL', totalAmount: 2200, paidAmount: 0, balanceAmount: 2200,
    paymentMethod: 'Online Payment After Completion', status: 'UNPAID', daysOld: 1,
  });
  await notify(c7, { type: 'payment-due', title: 'Payment Due', message: `Your ${b7.serviceName} is complete. Please pay LKR 2200.00 via the link sent to your email.`, bookingId: b7.bookingId });
  console.log(`  ${b7.bookingId} / ${i7.invoiceNumber} — Pay-After-Completion, UNPAID (awaiting customer payment)`);

  // 4b. Completed and paid via the link.
  const c8 = await demoCustomer(8, 'Tharindu');
  const b8 = await new Booking({
    customerId: c8._id, customerName: `${c8.firstName} ${c8.lastName}`, customerEmail: c8.email,
    serviceName: 'Office Cleaning', serviceItems: [{ name: 'Office Cleaning', price: 6000, quantity: 1 }],
    date: daysAgo(5), time: '8:00AM - 10:00AM', address: 'Level 3, WTC, Colombo 01',
    price: 6000, paidAmount: 6000, balanceAmount: 0,
    paymentMethod: 'pay-after-completion', status: 'completed', balancePaid: true,
  }).save();
  const i8 = await makeInvoice({
    booking: b8, customer: c8, invoiceType: 'FINAL', totalAmount: 6000, paidAmount: 6000, balanceAmount: 0,
    paymentMethod: 'Online Payment After Completion', status: 'PAID', payherePaymentId: 'DEMO-PH-1008', daysOld: 4,
  });
  await notify(c8, { type: 'payment', title: 'Payment Successful', message: `Your payment of LKR 6000.00 for booking ${b8.bookingId} was successful.`, bookingId: b8.bookingId });
  console.log(`  ${b8.bookingId} / ${i8.invoiceNumber} — Pay-After-Completion, later PAID`);

  console.log('\n── Refunds (A.7) ────────────────────────────────────────────');

  // Reuse b1's invoice for a pending refund request (pre-service cancellation).
  const c9 = await demoCustomer(9, 'Chamodi');
  const b9 = await new Booking({
    customerId: c9._id, customerName: `${c9.firstName} ${c9.lastName}`, customerEmail: c9.email,
    serviceName: 'Home Cleaning', serviceItems: [{ name: 'Home Cleaning', price: 5500, quantity: 1 }],
    date: daysFromNow(5), time: '9:00AM - 11:00AM', address: '31 Duplication Road, Colombo 04',
    price: 5500, paidAmount: 5500, balanceAmount: 0,
    paymentMethod: 'full-online', status: 'cancelled',
  }).save();
  const i9 = await makeInvoice({
    booking: b9, customer: c9, invoiceType: 'FULL', totalAmount: 5500, paidAmount: 5500, balanceAmount: 0,
    paymentMethod: 'Full Online', status: 'REFUND_PENDING', payherePaymentId: 'DEMO-PH-1009', daysOld: 1,
  });
  const r9 = await new Refund({ invoice: i9._id, reason: 'Customer requested cancellation — travel plans changed.', status: 'PENDING', refundedAmount: 5500 }).save();
  console.log(`  ${b9.bookingId} / ${i9.invoiceNumber} — refund PENDING (Rs. ${r9.refundedAmount})`);

  const c10 = await demoCustomer(10, 'Buddhika');
  const b10 = await new Booking({
    customerId: c10._id, customerName: `${c10.firstName} ${c10.lastName}`, customerEmail: c10.email,
    serviceName: 'Curtain Cleaning', serviceItems: [{ name: 'Curtain Cleaning', price: 3800, quantity: 1 }],
    date: daysAgo(8), time: '1:00PM - 3:00PM', address: '60 Bauddhaloka Mawatha, Colombo 07',
    price: 3800, paidAmount: 3800, balanceAmount: 0,
    paymentMethod: 'full-online', status: 'cancelled',
  }).save();
  const i10 = await makeInvoice({
    booking: b10, customer: c10, invoiceType: 'FULL', totalAmount: 3800, paidAmount: 0, balanceAmount: 0,
    paymentMethod: 'Full Online', status: 'REFUNDED', payherePaymentId: 'DEMO-PH-1010', daysOld: 8,
  });
  const r10 = await new Refund({
    invoice: i10._id, reason: 'Duplicate booking made by mistake.', status: 'APPROVED',
    refundedAmount: 3800, refundDate: new Date(Date.now() - 6 * 86400000), paymentReference: 'DEMO-PH-1010',
  }).save();
  await notify(c10, { type: 'refund_processed', title: 'Refund Processed', message: `Your refund of Rs. 3800.00 has been processed successfully.`, bookingId: b10.bookingId });
  console.log(`  ${b10.bookingId} / ${i10.invoiceNumber} — refund APPROVED (Rs. ${r10.refundedAmount})`);

  console.log('\n── Price Reductions (A.8) ───────────────────────────────────');

  // Pending, on the COD booking (b6) — quality complaint after the fact.
  const pr1 = await new PriceReduction({
    invoice: i6._id, requestedAmount: 1000, reason: 'Carpet still had a visible stain after the service.', status: 'PENDING',
  }).save();
  console.log(`  ${i6.invoiceNumber} — price reduction PENDING (Rs. ${pr1.requestedAmount} requested)`);

  // Approved, on the loyalty invoice (i2).
  const pr2 = await new PriceReduction({
    invoice: i2._id, requestedAmount: 500, approvedAmount: 400, reason: 'One curtain panel was missed.', status: 'APPROVED',
    reductionType: 'REFUND',
  }).save();
  await notify(c2, { type: 'price_reduction_approved', title: 'Price Reduction Approved', message: `Your price reduction request for Rs. 400.00 has been approved.`, bookingId: b2.bookingId });
  console.log(`  ${i2.invoiceNumber} — price reduction APPROVED (Rs. ${pr2.approvedAmount})`);

  console.log('\n✅ Demo data seeded. Every account created ends in ' + DEMO_EMAIL_DOMAIN);
  console.log('   Re-run with CLEANUP=true to remove all of it later.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
