const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getTier } = require('../constants/loyalty');

/**
 * MASTER USER MODEL — shared by all roles
 * role: 'customer' | 'staff' | 'admin' | 'super_admin'
 */
const userSchema = new mongoose.Schema(
  {
    // — Identity ——————————————————————————————————————————————————————————————
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    name:      { type: String, trim: true }, // auto-computed below

    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone:    { type: String, trim: true },
    address:  { type: String, trim: true },
    profilePhoto: { type: String }, // base64 or URL

    // — Roles —————————————————————————————————————————————————————————————————
    role: {
      type:    String,
      enum:    ['customer', 'staff', 'admin', 'super_admin'],
      default: 'customer',
    },
    // Sub-role for admins only
    adminRole: {
      type: String,
      enum: ['Super Admin', 'Main Admin', 'Operations Manager', 'Customer Support'],
    },

    // — Account status ————————————————————————————————————————————————————————
    isVerified:             { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    status:                 { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' },
    requiresPasswordChange: { type: Boolean, default: false },
    // Set by the customer self-service "Delete Account" flow (authController.deleteAccount).
    // Distinct from an admin setting status:'blocked' on a troublesome customer —
    // this marks a customer-initiated deletion for support/audit purposes.
    deletedAt:               { type: Date },

    // — Loyalty (customers) ———————————————————————————————————————————————————
    loyaltyPoints:  { type: Number, default: 0, min: 0 }, // spendable currentBalance — can never go negative; resets Dec 31 each year
    lifetimePoints: { type: Number, default: 0 }, // never resets by expiry — determines tier permanently; only earning/reversal change it
    // Points still owed back because a reversal exceeded currentBalance at the
    // time (i.e. the points being clawed back had already been redeemed).
    // Future earned points repay this before adding to currentBalance, and no
    // redemption is allowed while it's > 0. See loyaltyController.js.
    loyaltyDebt: { type: Number, default: 0, min: 0 },
    badge: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    },
    // Permanent, one-time-ever record of which tier perks this customer has
    // been GRANTED (i.e. has ever reached that tier) — never cleared, even if
    // the customer later drops back down a tier. e.g. { Silver: true, Gold: true }
    tierPerksGranted: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Whether a granted perk has actually been applied as a discount yet —
    // separate from "granted" so a perk earned but not yet spent stays usable.
    tierPerksUsed: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Which calendar year currentBalance was last zeroed for (annual expiry) —
    // prevents the Dec 31 cron / admin reset from double-expiring the same year.
    loyaltyLastExpiryYear: { type: Number },

    // — Staff-specific ————————————————————————————————————————————————————————
    specializations: [{ type: String }], // e.g. ['Home Cleaning', 'Laundry']
    nic:             { type: String, trim: true },
    isAvailable:     { type: Boolean, default: true },
    availabilityLogs: [{
      status:    { type: String },
      changedAt: { type: Date, default: Date.now },
      reason:    { type: String }, // set when status is 'unavailable' via an approved AvailabilityRequest
    }],
    rating:        { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },

    // — Live GPS tracking (staff) ————————————————————————————————————————————————
    gpsStatus:         { type: String, enum: ['On the Way', 'On Site', 'Completed', 'Offline'], default: 'Offline' },
    currentLat:        { type: Number },
    currentLng:        { type: Number },
    gpsEta:            { type: String },
    gpsCustomerName:   { type: String },
    gpsCustomerAddress:{ type: String },
    gpsCurrentJob:     { type: String },
    gpsUpdatedAt:      { type: Date },

    // — OAuth ——————————————————————————————————————————————————————————————————
    googleId: { type: String, select: false },

    // — OTP — email verification ———————————————————————————————————————————————
    otp:       { type: String },
    otpExpiry: { type: Date },

    // — OTP — password reset ———————————————————————————————————————————————————
    resetCode:         { type: String },
    resetCodeExpiry:   { type: Date },
    resetCodeVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// — Auto-build full name ————————————————————————————————————————————————————————
userSchema.pre('save', function (next) {
  if (this.firstName || this.lastName) {
    this.name = [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  next();
});

// — Hash password on change ————————————————————————————————————————————————————
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// — Compare password ———————————————————————————————————————————————————————————
userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

// — Auto-assign badge based on loyalty points ——————————————————————————————————
// Tier thresholds live in constants/loyalty.js — the single source of truth
// (this used to hardcode its own copy of the same thresholds, which had
// drifted out of sync with loyaltyController.js's copy during a merge).
userSchema.methods.updateBadge = function () {
  this.badge = getTier(this.lifetimePoints).name;
};

module.exports = mongoose.model('User', userSchema);
