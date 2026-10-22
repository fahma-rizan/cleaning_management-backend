/**
 * One-off: creates two fresh test bookings (through the real POST /api/bookings
 * endpoint, so material requests auto-generate exactly like production —
 * see services/materialRequestService.js), then assigns staff@cloudlaundry.lk
 * as the lead/sole assigned staff on both.
 *
 * - Booking 1: House Deep Cleaning (serviceId 1, per-sqft consumption) — 450
 *   sqft, sized to need exactly 1 staff (see getRequiredStaffCount in
 *   controllers/bookingController.js: ceil(450/500) = 1).
 * - Booking 2: Sofa Cleaning (serviceId 3, per-seat consumption) — 4 seats,
 *   also sized to need exactly 1 staff (ceil(4/6) = 1).
 * Both single-staff, so the assigned staff member IS the task's sole
 * lead/owner — no team-assignment complexity to work around.
 *
 * staff@cloudlaundry.lk had no specializations set, which would make normal
 * auto-assignment skip them entirely — this script (a) adds the two relevant
 * specializations to their profile, matching what they're now actually doing
 * (so future auto-assignment/admin filtering by specialization is accurate
 * too, not just these two bookings), and (b) force-sets assignedStaffId on
 * both bookings directly, so the outcome is guaranteed rather than
 * left to auto-assign's least-loaded pick among several qualified staff.
 *
 * Requires the backend to already be running on PORT (default 5000).
 * Command: node scripts/createTestBookingsWithStaff.js
 */
const dotenv = require('dotenv');
dotenv.config();
const jwt = require('jsonwebtoken');

const connectDB = require('../config/db');
const User = require('../models/User');
const Booking = require('../models/Booking');
const MaterialRequest = require('../models/MaterialRequest');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const STAFF_EMAIL = 'staff@cloudlaundry.lk';
const TEST_CUSTOMER_EMAIL = `booking-demo-${Date.now()}@example.com`;

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Tomorrow (server-local) — a future date so staff selection isn't limited
// to "currently available right now" (see isToday check in autoAssignBooking).
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const log = (label, ok) => console.log(`${ok ? '✅' : '❌'} ${label}`);

(async () => {
  await connectDB();
  let allOk = true;
  const date = tomorrowStr();

  // ─── Staff: ensure specializations match what we're about to assign them ──
  const staff = await User.findOne({ email: STAFF_EMAIL });
  if (!staff) {
    console.error(`❌ No staff account found for ${STAFF_EMAIL} — aborting.`);
    process.exit(1);
  }
  const neededSpecs = ['Home Cleaning', 'Sofa/Mattress Cleaning'];
  const missingSpecs = neededSpecs.filter(s => !staff.specializations.includes(s));
  if (missingSpecs.length) {
    staff.specializations.push(...missingSpecs);
    await staff.save();
  }
  log(`staff@cloudlaundry.lk specializations: [${staff.specializations.join(', ')}]`, true);

  // ─── Throwaway verified test customer to own these bookings ───────────────
  const customer = await User.create({
    firstName: 'Booking', lastName: 'Demo',
    email: TEST_CUSTOMER_EMAIL, phone: '0771112222', password: 'TestPass123!',
    role: 'customer', isVerified: true, loyaltyPoints: 0, badge: 'Bronze',
  });
  const token = generateToken(customer._id);

  const bookingsToCreate = [
    {
      label: 'House Deep Cleaning',
      body: {
        date, time: '10:30AM - 12:30PM',
        address: '123 Galle Road, Colombo 03',
        price: 15000,
        paymentMethod: 'pay-after-completion',
        serviceId: 1,
        serviceName: 'house deep cleaning',
        serviceType: 'Home/Office Cleaning',
        serviceCategory: 'House Deep Cleaning',
        cleaningType: 'normal',
        squareFeet: 450,
        rooms: 3,
        bathrooms: 2,
      },
    },
    {
      label: 'Sofa Cleaning',
      body: {
        date, time: '1:00PM - 3:00PM',
        address: '45 Marine Drive, Colombo 06',
        price: 6000,
        paymentMethod: 'pay-after-completion',
        serviceId: 3,
        serviceName: 'sofa cleaning',
        serviceType: 'Shampoo and Vacuum Cleaning',
        serviceCategory: 'Sofa Cleaning',
        sofaUnits: 1,
        sofaSeatingCapacity: 4,
      },
    },
  ];

  const results = [];

  for (const { label, body } of bookingsToCreate) {
    const res = await fetch(`${BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ok = res.status === 201 && data.success;
    log(`created booking "${label}" (status ${res.status}${ok ? ', id ' + data.booking.bookingId : ', ' + JSON.stringify(data)})`, ok);
    allOk = allOk && ok;
    if (ok) results.push({ label, booking: data.booking });
  }

  // ─── Force staff@cloudlaundry.lk onto both bookings + verify material requests ──
  for (const { label, booking } of results) {
    const fresh = await Booking.findById(booking._id);
    fresh.assignedStaffId    = staff._id;
    fresh.assignedStaffName  = staff.name;
    fresh.assignedStaffEmail = staff.email;
    fresh.assignedTeam       = []; // single-staff — they ARE the sole lead
    fresh.needsAdminAttention     = false;
    fresh.adminNotificationReason = '';
    await fresh.save();

    const okAssign = fresh.assignedStaffEmail === STAFF_EMAIL;
    log(`"${label}" (${fresh.bookingId}) assigned to ${STAFF_EMAIL}`, okAssign);
    allOk = allOk && okAssign;

    const mr = await MaterialRequest.findOne({ bookingId: fresh._id });
    const okMr = !!mr && mr.items.length > 0;
    log(`"${label}" material request: ${mr ? mr.items.map(i => `${i.name} x${i.qtyRequested}${i.unit}`).join(', ') : 'NONE'}`, okMr);
    allOk = allOk && okMr;
  }

  console.log(`\nTest customer: ${TEST_CUSTOMER_EMAIL} (id ${customer._id}) — left in place, not cleaned up (these are the two live test bookings).`);
  console.log(allOk ? '\n✅ All checks passed.' : '\n❌ Some checks failed — see above.');
  process.exit(allOk ? 0 : 1);
})().catch((err) => {
  console.error('createTestBookingsWithStaff failed:', err);
  process.exit(1);
});
