const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * MASTER USER MODEL — shared by all roles
 * role: 'customer' | 'staff' | 'admin'
 * adminRole (only when role === 'admin'): 'Super Admin' | 'Main Admin' | 'Operations Manager' | 'Customer Support'
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
    profilePhoto: { type: String }, // base64 or URL — used by all roles (customer, staff, admin)

    // — Roles —————————————————————————————————————————————————————————————————
    role: {
      type:    String,
      enum:    ['customer', 'staff', 'admin'],
      default: 'customer',
    },
    adminRole: {
      type: String,
      enum: ['Super Admin', 'Main Admin', 'Operations Manager', 'Customer Support'],
    },

    // — Account status ————————————————————————————————————————————————————————
    isVerified:             { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    requiresPasswordChange: { type: Boolean, default: false },

    // — Admin-specific ————————————————————————————————————————————————————————
    isSuperAdmin: { type: Boolean, default: false },
    adminStatus:  { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    lastActive:   { type: Date, default: () => new Date() },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // — Loyalty (customers) ———————————————————————————————————————————————————
    loyaltyPoints: { type: Number, default: 0 },
    badge: {
      type: String,
      enum: ['Silver', 'Gold', 'Platinum'],
    },

    // — Customer-specific ————————————————————————————————————————————————————————
    joinDate:       { type: Date, default: () => new Date() },
    totalBookings:  { type: Number, default: 0 },
    totalSpent:     { type: Number, default: 0 },
    customerStatus: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' },
    lastBooking:    { type: Date, default: null },

    // — Staff-specific ————————————————————————————————————————————————————————
    specializations: [{ type: String }],
    nic:             { type: String, trim: true },
    isAvailable:     { type: Boolean, default: true },
    availabilityLogs: [{
      status:    { type: String },
      changedAt: { type: Date, default: Date.now },
    }],
    rating:        { type: Number, default: 0 },
    jobsCompleted: { type: Number, default: 0 },
    staffStatus:   { type: String, enum: ['Active', 'Inactive'], default: 'Active' },

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

userSchema.pre('save', function () {
  if (this.firstName || this.lastName) {
    this.name = [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.updateBadge = function () {
  if      (this.loyaltyPoints >= 1000) this.badge = 'Platinum';
  else if (this.loyaltyPoints >= 500)  this.badge = 'Gold';
  else if (this.loyaltyPoints >= 100)  this.badge = 'Silver';
  else                                  this.badge = undefined;
};

module.exports = mongoose.model('User', userSchema);