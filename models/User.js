const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    name:      { type: String },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:     { type: String, trim: true },
    password:  { type: String, required: true },

    role: {
      type: String,
      enum: ['customer', 'admin', 'staff', 'cleaner'],
      default: 'customer',
    },
    adminRole: {
      type: String,
      enum: ['Admin', 'Operations Manager', 'Customer Support'],
    },

    verified: { type: Boolean, default: false },
    requiresPasswordChange: { type: Boolean, default: false },

    loyaltyPoints: { type: Number, default: 0 },
    badge: {
      type: String,
      enum: ['Silver', 'Gold', 'Platinum'],
      default: 'Silver',
    },

    // Staff-specific
    specializations: [{ type: String }],   // e.g. ['Home Cleaning', 'Laundry Service']
    nic:             { type: String, trim: true },
    address:         { type: String, trim: true },
    profilePhoto:    { type: String },     // base64 data URL

    // Staff availability
    isAvailable: { type: Boolean, default: true },
    availabilityLogs: [{
      status:    { type: String },
      changedAt: { type: Date, default: Date.now },
    }],

    // OTP for email verification (registration)
    otp:       { type: String },
    otpExpiry: { type: Date },

    // OTP for password reset
    resetCode:         { type: String },
    resetCodeExpiry:   { type: Date },
    resetCodeVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-build full name before saving
userSchema.pre('save', function (next) {
  if (this.firstName) {
    this.name = (this.lastName && this.lastName !== this.firstName)
      ? `${this.firstName} ${this.lastName}`
      : this.firstName;
  }
  next();
});

// Hash password before saving (only when it changes)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
