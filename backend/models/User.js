const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role:     { type: String, required: true, default: 'customer', enum: ['customer', 'staff', 'operation_admin', 'customer_support_admin', 'main_admin', 'admin', 'super_admin'] },
    phone:              { type: String },
    isVerified:         { type: Boolean, default: false },
    isActive:           { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    googleId:           { type: String, select: false },

    // ── Fields below exist on the shared users collection but aren't used
    // by this app's own logic yet. Declared here (loosely typed, all
    // optional) so Mongoose's default strict mode doesn't silently strip
    // them off a document that gets re-saved through this model. ──
    firstName:           { type: String },
    lastName:            { type: String },
    verified:            { type: Boolean, default: false },
    requiresPasswordChange: { type: Boolean, default: false },
    address:             { type: String },
    specializations:     [{ type: String }],
    nic:                 { type: String },
    rating:              { type: Number },
    jobsCompleted:       { type: Number },
    resetCodeVerified:   { type: Boolean },
    availabilityLogs:    [{ type: mongoose.Schema.Types.Mixed }],
    profilePhoto:        { type: String },
    isSuperAdmin:        { type: Boolean },
    adminStatus:         { type: String },
    adminRole:           { type: String },
    createdBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    totalBookings:       { type: Number },
    totalSpent:          { type: Number },
    customerStatus:      { type: String },
    lastBooking:         { type: mongoose.Schema.Types.Mixed },
    staffStatus:         { type: String },
    lastActive:          { type: Date },
    joinDate:            { type: Date },
    status:              { type: String },
    lifetimePoints:      { type: Number },
    badge:               { type: String },
    gpsStatus:           { type: String },
    loyaltyPoints:       { type: Number, default: 0 },
    isAvailable:         { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);