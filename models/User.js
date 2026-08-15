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
      enum: ['Operations Manager', 'Customer Support'],
    },

    // — Account status ————————————————————————————————————————————————————————
    isVerified:             { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    requiresPasswordChange: { type: Boolean, default: false },

    // — Loyalty (customers) ———————————————————————————————————————————————————
    loyaltyPoints: { type: Number, default: 0 },
    badge: {
      type: String,
      enum: ['Silver', 'Gold', 'Platinum'],
    },

    // — Staff-specific ————————————————————————————————————————————————————————
    specializations: [{ type: String }], // e.g. ['Home Cleaning', 'Laundry']
    nic:             { type: String, trim: true },
    isAvailable:     { type: Boolean, default: true },
    availabilityLogs: [{
      status:    { type: String },
      changedAt: { type: Date, default: Date.now },
    }],
    rating:        { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },

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
userSchema.methods.updateBadge = function () {
  if      (this.loyaltyPoints >= 1000) this.badge = 'Platinum';
  else if (this.loyaltyPoints >= 500)  this.badge = 'Gold';
  else if (this.loyaltyPoints >= 100)  this.badge = 'Silver';
  else                                  this.badge = undefined;
};

module.exports = mongoose.model('User', userSchema);
