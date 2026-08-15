import { describe, it, expect } from 'vitest';
import {
  createBookingSchema,
  rescheduleSchema,
  declineSchema,
  slotCheckSchema,
} from '../validators/bookingValidators.js';

// ─── createBookingSchema ──────────────────────────────────────────────────────
describe('createBookingSchema', () => {
  const validData = {
    date: '2026-05-10',
    time: '9:00AM - 11:00AM',
    address: '123 Main Street, Colombo',
    price: 1500,
    paymentMethod: 'cod',
    serviceName: 'house deep cleaning',
  };

  it('accepts valid booking data', () => {
    expect(() => createBookingSchema.parse(validData)).not.toThrow();
  });

  it('accepts serviceCategory instead of serviceName', () => {
    const data = { ...validData, serviceName: undefined, serviceCategory: 'Home Cleaning' };
    expect(() => createBookingSchema.parse(data)).not.toThrow();
  });

  it('rejects when both serviceName and serviceCategory are missing', () => {
    const data = { ...validData, serviceName: undefined, serviceCategory: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects missing date', () => {
    const data = { ...validData, date: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects invalid date format (DD/MM/YYYY)', () => {
    const data = { ...validData, date: '10/05/2026' };
    expect(() => createBookingSchema.parse(data)).toThrow(/YYYY-MM-DD/i);
  });

  it('rejects non-calendar date (month 13)', () => {
    const data = { ...validData, date: '2026-13-01' };
    expect(() => createBookingSchema.parse(data)).toThrow(/valid calendar date/i);
  });

  it('rejects missing time', () => {
    const data = { ...validData, time: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects time slot not in allowed list', () => {
    const data = { ...validData, time: '8:00AM - 9:00AM' };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('accepts all four valid time slots', () => {
    const slots = [
      '9:00AM - 11:00AM',
      '11:00AM - 1:00PM',
      '2:00PM - 4:00PM',
      '4:00PM - 6:00PM',
    ];
    slots.forEach(time => {
      expect(() => createBookingSchema.parse({ ...validData, time })).not.toThrow();
    });
  });

  it('rejects missing address', () => {
    const data = { ...validData, address: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects address shorter than 5 characters', () => {
    const data = { ...validData, address: 'abc' };
    expect(() => createBookingSchema.parse(data)).toThrow(/5 characters/i);
  });

  it('rejects missing price', () => {
    const data = { ...validData, price: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects price equal to 0', () => {
    const data = { ...validData, price: 0 };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects negative price', () => {
    const data = { ...validData, price: -500 };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });

  it('rejects missing paymentMethod', () => {
    const data = { ...validData, paymentMethod: undefined };
    expect(() => createBookingSchema.parse(data)).toThrow();
  });
});

// ─── rescheduleSchema ─────────────────────────────────────────────────────────
describe('rescheduleSchema', () => {
  const validData = { date: '2026-06-15', time: '2:00PM - 4:00PM' };

  it('accepts valid reschedule data', () => {
    expect(() => rescheduleSchema.parse(validData)).not.toThrow();
  });

  it('rejects missing date', () => {
    expect(() => rescheduleSchema.parse({ time: '2:00PM - 4:00PM' })).toThrow();
  });

  it('rejects missing time', () => {
    expect(() => rescheduleSchema.parse({ date: '2026-06-15' })).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() => rescheduleSchema.parse({ ...validData, date: '15-06-2026' })).toThrow(/YYYY-MM-DD/i);
  });

  it('rejects invalid time slot', () => {
    expect(() => rescheduleSchema.parse({ ...validData, time: 'random time' })).toThrow();
  });
});

// ─── declineSchema ────────────────────────────────────────────────────────────
describe('declineSchema', () => {
  it('accepts a valid reason', () => {
    expect(() => declineSchema.parse({ reason: 'I am unavailable that day' })).not.toThrow();
  });

  it('rejects missing reason', () => {
    expect(() => declineSchema.parse({})).toThrow();
  });

  it('rejects reason shorter than 3 characters', () => {
    expect(() => declineSchema.parse({ reason: 'no' })).toThrow(/3 characters/i);
  });

  it('accepts reason exactly 3 characters', () => {
    expect(() => declineSchema.parse({ reason: 'ill' })).not.toThrow();
  });
});

// ─── slotCheckSchema ──────────────────────────────────────────────────────────
describe('slotCheckSchema', () => {
  it('accepts a valid date query param', () => {
    expect(() => slotCheckSchema.parse({ date: '2026-05-01' })).not.toThrow();
  });

  it('rejects missing date', () => {
    expect(() => slotCheckSchema.parse({})).toThrow();
  });

  it('rejects date in wrong format', () => {
    expect(() => slotCheckSchema.parse({ date: '01-05-2026' })).toThrow(/YYYY-MM-DD/i);
  });

  it('rejects date with letters', () => {
    expect(() => slotCheckSchema.parse({ date: 'next-monday' })).toThrow();
  });
});
