const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, unique: true },

    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName:  { type: String },
    customerEmail: { type: String },

    serviceId:       { type: String },
    serviceName:     { type: String, required: true },
    serviceType:     { type: String },
    serviceCategory: { type: String },

    date:    { type: String },
    time:    { type: String },
    address: { type: String, required: true },

    price:         { type: Number, default: 0 },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },

    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'online'],
    },
    paymentMethodName: { type: String, default: '' }, // admin-module addition — display label for reports/exports
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

    assignedStaffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedStaffName:  { type: String },
    assignedStaffEmail: { type: String },
    taskStartedAt:      { type: Date },
    taskCompletedAt:    { type: Date },
    scheduledAt:        { type: Date, default: null }, // admin-module addition — used for overview sorting

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

    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest' },
    materialStatus: {
      type: String,
      enum: ['pending_materials', 'materials_approved', 'materials_rejected', 'in_progress', 'pending_verification', 'completed', 'cancelled'],
      default: 'pending_materials',
    },

    houseSize:           { type: String, enum: ['small', 'medium', 'large', 'xl'] },
    rooms:               { type: Number },
    bathrooms:           { type: Number },
    frequency:           { type: String, enum: ['once', 'weekly', 'biweekly', 'monthly'] },
    specialInstructions: { type: String },

    laundryWeight:         { type: Number },
    laundryServices:       [{ type: String }],
    laundryItemType:       { type: String },
    laundrySelectedItems:  { type: mongoose.Schema.Types.Mixed },
    laundryPickupDelivery: { type: Boolean, default: false },

    curtainServiceType: { type: String },
    curtainOptions:     [{ type: String }],
    curtainQuantity:    { type: Number },

    sofaUnits:           { type: Number },
    sofaSeatingCapacity: { type: Number },
    mattressCount:       { type: Number },
    mattressSquareFeet:  { type: Number },
    carpetCount:         { type: Number },
    carpetSquareFeet:    { type: Number },

    loyaltyPointsEarned: { type: Number, default: 0 },
    cancelledAt:         { type: Date },
    completedAt:         { type: Date },
  },
  { timestamps: true }
);

bookingSchema.pre('save', async function (next) {
  if (!this.bookingId) {
    this.bookingId = `BK-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);