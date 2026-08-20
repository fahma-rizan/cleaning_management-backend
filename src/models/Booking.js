const mongoose = require('mongoose');

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
    bookingId: { type: String, unique: true }, // Auto-generated e.g. BK-1714123456789

    // ── Customer ──────────────────────────────────────────────────────────────
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName:  { type: String },   // denormalised for display speed
    customerEmail: { type: String },

    // ── Service info ──────────────────────────────────────────────────────────
    serviceId:       { type: String },
    serviceName:     { type: String, required: true },
    serviceType:     { type: String }, // e.g. 'Home/Office Cleaning'
    serviceCategory: { type: String }, // e.g. 'House Deep Cleaning'

    // ── Schedule ──────────────────────────────────────────────────────────────
    date:    { type: String },  // YYYY-MM-DD
    time:    { type: String },  // e.g. '9:00AM - 11:00AM'
    address: { type: String, required: true }, // flattened, single-line — kept for backward compatibility with Invoice, GPSTracking, dashboard cards, etc.

    // Structured breakdown of `address` above, captured by the AddressInput
    // component. Optional so older bookings / other flows that only send
    // the flat string still validate fine.
    addressDetails: {
      line1:      { type: String },
      line2:      { type: String },
      city:       { type: String },
      postalCode: { type: String },
      notes:      { type: String },
    },

    // ── Pricing ───────────────────────────────────────────────────────────────
    price:         { type: Number, default: 0 },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },

    // ── Payment ───────────────────────────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'online'],
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

// Auto-generate bookingId
bookingSchema.pre('save', async function (next) {
  if (!this.bookingId) {
    this.bookingId = `BK-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
