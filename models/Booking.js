const mongoose = require('mongoose');
const Counter  = require('./Counter');

/**
 * MASTER BOOKING MODEL — shared by all 5 members
 * Replaces: Booking.js, Booking -.js, Booking -3.js, Booking 1.ts, Booking 6.js
 *
 * Key decisions applied:
 * - User ref field unified to: customerId → ref 'User'
 * - Status enum: lowercase, hyphenated
 * - Price field: 'price' (not totalAmount)
 * - Date stored as String 'YYYY-MM-DD' (consistent with most members)
 * - materialRequestId added for inventory member (Booking 6)
 * - Staff assignment supports both single (assignedStaffId) and team (assignedTeam)
 */
const bookingSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    bookingId: { type: String, unique: true }, // Auto-generated e.g. BK-20260818-0001

    // Correlation token used ONLY for the online-payment checkout round-trip.
    // Nothing is written to the DB when a customer starts checkout — this
    // value is generated client-side, carried through PayHere's custom_1
    // field, and only ever shows up here the moment this Booking document
    // itself is first created (i.e. once payment has actually succeeded).
    // The frontend polls GET /api/bookings/by-ref/:checkoutRef with it to
    // find the real booking once the webhook has processed it.
    checkoutRef: { type: String, index: true, sparse: true },

    // ── Customer ──────────────────────────────────────────────────────────────
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName:  { type: String },   // denormalised for display speed
    customerEmail: { type: String },

    // ── Service info ──────────────────────────────────────────────────────────
    serviceId:       { type: String },
    serviceName:     { type: String, required: true },
    serviceType:     { type: String }, // e.g. 'Home/Office Cleaning'
    serviceCategory: { type: String }, // e.g. 'House Deep Cleaning'
    // Line-item breakdown when a booking covers more than one service
    // (mirrors Invoice.serviceItems so the same object can flow straight
    // through into the invoice later without reshaping it).
    serviceItems: [{
      name:     { type: String, required: true },
      price:    { type: Number, required: true },
      quantity: { type: Number, default: 1 },
    }],

    // ── Schedule ──────────────────────────────────────────────────────────────
    date:    { type: String },  // YYYY-MM-DD
    time:    { type: String },  // e.g. '9:00AM - 11:00AM'
    address: { type: String, required: true },

    // ── Pricing ───────────────────────────────────────────────────────────────
    price:         { type: Number, default: 0 },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    // FIX: routes/booking.js was setting this on the in-memory document but
    // it was never a declared schema path, so Mongoose silently dropped it
    // on save — record-cash-payment looked like it worked but the flag
    // never actually reached the database.
    balancePaid:   { type: Boolean, default: false },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },

    // ── Payment ───────────────────────────────────────────────────────────────
    // FIX: was ['cash','card','online'] — didn't match the 4 real payment
    // method identifiers used everywhere else in the app (PaymentPage.tsx,
    // PaymentReportExport.tsx, invoiceController.js). Code elsewhere was
    // already assigning 'cod' and 'CASH' here, both of which failed this
    // enum silently/loudly depending on the save path. Aligned to the
    // actual 4 methods from the workflow spec.
    paymentMethod: {
      type: String,
      enum: ['full-online', 'advance-balance', 'cod', 'pay-after-completion'],
    },
    // Set only once staff record how a COD/pay-after-completion balance or
    // full amount was actually settled on-site (kept separate from
    // paymentMethod so we never overwrite the customer's original choice).
    balanceSettledVia: {
      type: String,
      enum: ['cash', 'online'],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
    },
    packageType: {
      type: String,
      enum: ['standard', 'premium'],
      default: 'standard',
    },

    // ── Staff assignment ──────────────────────────────────────────────────────
    assignedStaffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedStaffName:  { type: String },
    assignedStaffEmail: { type: String },
    taskStartedAt:      { type: Date },
    taskCompletedAt:    { type: Date },

    // Team (multi-staff jobs: home cleaning, sofa/mattress)
    assignedTeam: [{
      staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      staffName:  { type: String },
      staffEmail: { type: String },
    }],

    declineHistory: [{
      staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      staffName:  { type: String },
      staffEmail: { type: String },
      reason:     { type: String },
      declinedAt: { type: Date, default: Date.now },
    }],

    needsAdminAttention:     { type: Boolean, default: false },
    adminNotificationReason: { type: String },

    // ── Inventory module (Member 6) ───────────────────────────────────────────
    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest' },
    materialStatus: {
      type: String,
      enum: ['pending_materials', 'materials_approved', 'materials_rejected', 'in_progress', 'pending_verification', 'completed', 'cancelled'],
      default: 'pending_materials',
    },

    // ── Service-specific fields ───────────────────────────────────────────────
    // Home / Office Cleaning
    houseSize:           { type: String, enum: ['small', 'medium', 'large', 'xl'] },
    rooms:               { type: Number },
    bathrooms:           { type: Number },
    frequency:           { type: String, enum: ['once', 'weekly', 'biweekly', 'monthly'] },
    specialInstructions: { type: String },

    // Laundry
    laundryWeight:         { type: Number },
    laundryServices:       [{ type: String }],
    laundryItemType:       { type: String },
    laundrySelectedItems:  { type: mongoose.Schema.Types.Mixed },
    laundryPickupDelivery: { type: Boolean, default: false },

    // Curtain
    curtainServiceType: { type: String },
    curtainOptions:     [{ type: String }],
    curtainQuantity:    { type: Number },

    // Sofa / Mattress / Carpet
    sofaUnits:           { type: Number },
    sofaSeatingCapacity: { type: Number },
    mattressCount:       { type: Number },
    mattressSquareFeet:  { type: Number },
    carpetCount:         { type: Number },
    carpetSquareFeet:    { type: Number },

    // ── Misc ─────────────────────────────────────────────────────────────────
    loyaltyPointsEarned: { type: Number, default: 0 },
    cancelledAt:         { type: Date },
    completedAt:         { type: Date },
  },
  { timestamps: true }
);

// Auto-generate bookingId: BK-<YYYYMMDD>-<sequence>
//
// The sequence is ONE continuous counter shared by every booking in the
// system — it does NOT reset per day. Key 'booking' is a single Counter
// document that just keeps incrementing from booking #1 onward forever.
// The <YYYYMMDD> part is only the date this particular booking was made —
// it does not affect or reset the sequence number.
bookingSchema.pre('save', async function () {
  if (!this.bookingId) {
    const counter = await Counter.findByIdAndUpdate(
      'booking',                 // fixed, global key — same for every booking, every day
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const dateStr      = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const sequenceStr  = counter.seq.toString().padStart(4, '0');

    this.bookingId = `BK-${dateStr}-${sequenceStr}`;
  }
});

module.exports = mongoose.model('Booking', bookingSchema);