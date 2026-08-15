import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import validate from '../middleware/validate.js';

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data)  => { res.body = data; return res; };
  return res;
};

// ─── validate middleware (body) ───────────────────────────────────────────────
describe('validate middleware — body', () => {
  const schema = z.object({
    name:  z.string().min(2, 'name too short'),
    price: z.number().positive('price must be positive'),
  });

  it('calls next() when body is valid', () => {
    const req  = { body: { name: 'Laundry', price: 500 } };
    const res  = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when a required field is missing', () => {
    const req  = { body: { price: 500 } };
    const res  = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when field fails validation rule', () => {
    const req  = { body: { name: 'x', price: 500 } };
    const res  = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/name too short/i);
  });

  it('returns 400 when price is negative', () => {
    const req  = { body: { name: 'Laundry', price: -10 } };
    const res  = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/price must be positive/i);
  });

  it('returns error message listing the failing field path', () => {
    const req  = { body: { name: 'Laundry', price: 0 } };
    const res  = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(res.body.message).toMatch(/price/);
  });
});

// ─── validate middleware (query) ─────────────────────────────────────────────
describe('validate middleware — query', () => {
  const querySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date format'),
  });

  it('calls next() when query param is valid', () => {
    const req  = { query: { date: '2026-05-01' } };
    const res  = makeRes();
    const next = vi.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 400 when query param is missing', () => {
    const req  = { query: {} };
    const res  = makeRes();
    const next = vi.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when query param has wrong format', () => {
    const req  = { query: { date: '01/05/2026' } };
    const res  = makeRes();
    const next = vi.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid date format/i);
  });
});
