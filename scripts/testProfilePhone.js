/**
 * One-off smoke test for the "phone entered at registration shows up on
 * My Profile" fix — creates a throwaway verified customer with a phone,
 * logs in and checks the login response includes it, then exercises
 * PUT /api/auth/profile, then removes the test document.
 *
 * Requires the backend to already be running on PORT (default 5000).
 * Command: node scripts/testProfilePhone.js
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/db');
const User = require('../models/User');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const TEST_EMAIL = `profile-phone-smoketest-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_PHONE = '0771234567';

const log = (label, ok) => console.log(`${ok ? '✅' : '❌'} ${label}`);

(async () => {
  await connectDB();
  let allOk = true;
  let userId;

  try {
    const user = await User.create({
      firstName: 'Phone', lastName: 'Test',
      email: TEST_EMAIL, phone: TEST_PHONE, password: TEST_PASSWORD,
      role: 'customer', isVerified: true, loyaltyPoints: 0, badge: 'Bronze',
    });
    userId = user._id;

    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const loginData = await loginRes.json();
    const ok1 = loginData.success && loginData.user?.phone === TEST_PHONE;
    log(`login response includes the registered phone (got "${loginData.user?.phone}")`, ok1);
    allOk = allOk && ok1;
    const token = loginData.token;

    // Update via the new profile endpoint.
    const NEW_PHONE = '0719876543';
    const updateRes = await fetch(`${BASE}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Phone Updated', phone: NEW_PHONE }),
    });
    const updateData = await updateRes.json();
    const ok2 = updateRes.status === 200 && updateData.success && updateData.user?.phone === NEW_PHONE && updateData.user?.name === 'Phone Updated';
    log(`PUT /api/auth/profile persists new name/phone (status ${updateRes.status}, phone="${updateData.user?.phone}", name="${updateData.user?.name}")`, ok2);
    allOk = allOk && ok2;

    // Reject an invalid phone.
    const badRes = await fetch(`${BASE}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: 'not-a-phone' }),
    });
    const ok3 = badRes.status === 400;
    log(`invalid phone rejected (status ${badRes.status})`, ok3);
    allOk = allOk && ok3;

    // Confirm the DB actually reflects the change.
    const after = await User.findById(userId);
    const ok4 = after.phone === NEW_PHONE && after.name === 'Phone Updated';
    log(`DB row reflects the update (phone="${after.phone}", name="${after.name}")`, ok4);
    allOk = allOk && ok4;
  } finally {
    if (userId) await User.deleteOne({ _id: userId });
  }

  console.log(allOk ? '\n✅ All checks passed.' : '\n❌ Some checks failed — see above.');
  process.exit(allOk ? 0 : 1);
})().catch((err) => {
  console.error('testProfilePhone failed:', err);
  process.exit(1);
});
