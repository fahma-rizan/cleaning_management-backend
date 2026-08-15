import { describe, it, expect, vi } from 'vitest';

// ── Note on mocking strategy ──────────────────────────────────────────────────
// The controller uses CJS require() while the test file uses ESM imports.
// In this mixed setup, vi.mock() in the ESM layer cannot reliably intercept
// require() calls inside the CJS controller — the two registries are separate.
//
// We therefore test only the controller paths that return BEFORE any database
// call is made (pure input-validation guards).  DB-interaction paths are
// covered by integration / E2E tests that run against a real database.

vi.mock('../models/Booking.js',  () => ({ default: {} }));
vi.mock('../models/User.js',     () => ({ default: {} }));
vi.mock('../utils/sendEmail.js', () => ({ default: vi.fn() }));

import {
  checkSlotAvailability,
  declineTask,
} from '../controllers/bookingController.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeReq = (overrides = {}) => ({
  body:   {},
  query:  {},
  params: {},
  user:   { _id: 'staff-id-123', name: 'Test Staff', email: 'staff@test.com' },
  ...overrides,
});

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data)  => { res.body = data;       return res; };
  return res;
};

// ── checkSlotAvailability — missing date guard ────────────────────────────────
describe('checkSlotAvailability', () => {
  it('returns 400 with success:false when date query param is missing', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();

    await checkSlotAvailability(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/date is required/i);
  });

  it('returns a message (not success:true yet) when date is blank string', async () => {
    const req = makeReq({ query: { date: '' } });
    const res = makeRes();

    await checkSlotAvailability(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── declineTask — missing reason guard ────────────────────────────────────────
describe('declineTask', () => {
  it('returns 400 with success:false when reason is missing', async () => {
    const req = makeReq({ params: { id: 'booking-123' }, body: {} });
    const res = makeRes();

    await declineTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/reason is required/i);
  });

  it('returns 400 when reason is an empty string', async () => {
    const req = makeReq({ params: { id: 'booking-123' }, body: { reason: '' } });
    const res = makeRes();

    await declineTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
