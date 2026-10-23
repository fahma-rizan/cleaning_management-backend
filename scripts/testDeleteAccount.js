/**
 * One-off smoke test for the customer "Delete Account" flow — creates a
 * throwaway verified customer, logs in, calls DELETE /api/auth/account
 * against the running server, checks the account is anonymized + a reused
 * token is now rejected, then removes the test document entirely.
 *
 * Requires the backend to already be running on PORT (default 5000).
 * Command: node scripts/testDeleteAccount.js
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/db');
const User = require('../models/User');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const TEST_EMAIL = `delete-account-smoketest-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';

const log = (label, ok) => console.log(`${ok ? '✅' : '❌'} ${label}`);

(async () => {
  await connectDB();
  let allOk = true;
  let userId;

  try {
    // 1. Create a pre-verified test customer directly (skip OTP flow).
    const user = await User.create({
      firstName: 'Smoke',
      lastName: 'Test',
      email: TEST_EMAIL,
      phone: '0770000000',
      password: TEST_PASSWORD,
      role: 'customer',
      isVerified: true,
      loyaltyPoints: 0,
      badge: 'Bronze',
    });
    userId = user._id;

    // 2. Log in for real, through the actual HTTP endpoint.
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const loginData = await loginRes.json();
    const ok1 = loginRes.status === 200 && loginData.success && !!loginData.token;
    log(`login succeeds (status ${loginRes.status})`, ok1);
    allOk = allOk && ok1;
    const token = loginData.token;

    // 3. Delete the account.
    const delRes = await fetch(`${BASE}/auth/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const delData = await delRes.json();
    const ok2 = delRes.status === 200 && delData.success;
    log(`DELETE /api/auth/account succeeds (status ${delRes.status}, message: "${delData.message}")`, ok2);
    allOk = allOk && ok2;

    // 4. Confirm the DB row is anonymized, not gone.
    const after = await User.findById(userId);
    const ok3 = !!after
      && after.email !== TEST_EMAIL
      && after.firstName === 'Deleted'
      && after.status === 'blocked'
      && after.isActive === false
      && !!after.deletedAt;
    log(`DB row anonymized + deactivated (kept for records): email="${after?.email}", status="${after?.status}", isActive=${after?.isActive}`, ok3);
    allOk = allOk && ok3;

    // 5. Confirm the OLD token no longer works against a protected route.
    const reuseRes = await fetch(`${BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: 'Whatever123!' }),
    });
    const ok4 = reuseRes.status === 401;
    log(`old JWT now rejected on protected routes (status ${reuseRes.status})`, ok4);
    allOk = allOk && ok4;

    // 6. Confirm the old email can be reused for a fresh signup (findOne no longer matches).
    const reused = await User.findOne({ email: TEST_EMAIL.toLowerCase() });
    const ok5 = !reused;
    log('original email freed up for reuse', ok5);
    allOk = allOk && ok5;
  } finally {
    // Cleanup — this is a throwaway smoke-test fixture, safe to hard-delete.
    if (userId) await User.deleteOne({ _id: userId });
  }

  console.log(allOk ? '\n✅ All checks passed.' : '\n❌ Some checks failed — see above.');
  process.exit(allOk ? 0 : 1);
})().catch((err) => {
  console.error('testDeleteAccount failed:', err);
  process.exit(1);
});
