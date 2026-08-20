const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

    // — Loyalty (customers) ———————————————————————————————————————————————————
    loyaltyPoints:  { type: Number, default: 0 }, // redeemable balance — resets Dec 31 each year
    lifetimePoints: { type: Number, default: 0 }, // never resets — determines tier permanently
    badge: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    },
    // One-time discount reward per tier, e.g. { Silver: true, Gold: false, ... } once used
    tierDiscountsUsed: { type: mongoose.Schema.Types.Mixed, default: {} },
    // A reserved-but-not-yet-applied tier discount, consumed by the next booking
    pendingTierDiscount: {
      tier:     { type: String },
      percent:  { type: Number },
      reservedAt: { type: Date },
    },

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
// Tier thresholds are based on LIFETIME points (never reset) — keep in sync with
// the frontend's src/app/lib/loyaltyTiers.ts TIERS definition.
userSchema.methods.updateBadge = function () {
  if      (this.lifetimePoints >= 700) this.badge = 'Platinum';
  else if (this.lifetimePoints >= 300) this.badge = 'Gold';
  else if (this.lifetimePoints >= 100) this.badge = 'Silver';
  else                                   this.badge = 'Bronze';
};

module.exports = mongoose.model('User', userSchema);
