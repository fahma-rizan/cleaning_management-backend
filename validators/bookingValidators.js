const { z } = require('zod');

// Keep in sync with TIME_SLOTS in controllers/bookingController.js.
// 30-minute gap between every slot.
const TIME_SLOTS = [
  '8:00AM - 10:00AM',
  '10:30AM - 12:30PM',
  '1:00PM - 3:00PM',
  '3:30PM - 5:30PM',
  '6:00PM - 8:00PM',
];

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
  .refine(val => !isNaN(Date.parse(val)), 'date must be a valid calendar date');

const timeField = z
  .string()
  .refine(val => TIME_SLOTS.includes(val), `time must be one of: ${TIME_SLOTS.join(', ')}`);

// POST /api/bookings
// The consumption-factor fields (squareFeet/sofaSeatingCapacity/curtainQuantity/
// mattressSize/mattressCleaningLevel) are only required for the specific
// service being booked — that's service-dependent, so it's enforced in
// createBooking (via the service's consumptionrates.unitBasis) rather than
// here; at the schema level they're all optional.
const createBookingSchema = z.object({
  date:            dateField,
  time:            timeField,
  address:         z.string().min(5, 'address must be at least 5 characters'),
  price:           z.number().positive('price must be greater than 0'),
  paymentMethod:   z.string().min(1, 'paymentMethod is required'),
  serviceName:     z.string().min(1).optional(),
  serviceCategory: z.string().min(1).optional(),
  serviceId:       z.coerce.number().optional(),
  cleaningType:    z.string().optional(),
  squareFeet:          z.coerce.number().optional(),
  sofaSeatingCapacity: z.coerce.number().optional(),
  curtainQuantity:     z.coerce.number().optional(),
  mattressSize:          z.enum(['Single', 'Double', 'Queen', 'King']).optional(),
  mattressCleaningLevel: z.enum(['Full', 'Top Only']).optional(),
}).refine(
  data => data.serviceName || data.serviceCategory,
  { message: 'serviceName or serviceCategory is required', path: ['serviceName'] }
);

// PATCH /api/bookings/:id/reschedule
const rescheduleSchema = z.object({
  date: dateField,
  time: timeField,
});

// PATCH /api/bookings/:id/decline
const declineSchema = z.object({
  reason: z.string().min(3, 'reason must be at least 3 characters'),
});

// PATCH /api/bookings/:id/cancel
const cancelSchema = z.object({
  reason: z.string().min(3, 'reason must be at least 3 characters'),
});

// GET /api/bookings/slot-check?date=&serviceName=&serviceType=&serviceCategory=
// The service fields are optional (defaults to a team-required Home/Office
// Cleaning check when omitted) — pass them so availability reflects the
// specific service's staff specialization + team-size requirement.
const slotCheckSchema = z.object({
  date:            dateField,
  serviceName:     z.string().optional(),
  serviceType:     z.string().optional(),
  serviceCategory: z.string().optional(),
});

module.exports = {
  createBookingSchema,
  rescheduleSchema,
  declineSchema,
  slotCheckSchema,
  cancelSchema,
};
