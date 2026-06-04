const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId:      { type: String, unique: true },          // e.g. BK-1714123456789
    customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName:   { type: String },
    customerEmail:  { type: String },

    // Service info
    serviceId:       { type: String },
    serviceName:     { type: String },   // lowercase e.g. "house deep cleaning"
    serviceType:     { type: String },   // e.g. "Home/Office Cleaning"
    serviceCategory: { type: String },   // e.g. "House Deep Cleaning"

    // Schedule
    date:    { type: String },   // YYYY-MM-DD
    time:    { type: String },   // e.g. "9:00AM - 11:00AM"
    address: { type: String },

    // Pricing
    price:         { type: Number, default: 0 },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    // Status
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'confirmed-paid', 'confirmed-partial', 'confirmed-unpaid',
             'processing', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },

    // Payment
    paymentMethod:     { type: String },
    paymentMethodName: { type: String },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
    },

    // Staff assignment
    assignedStaffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedStaffName:  { type: String },
    assignedStaffEmail: { type: String },
    taskStartedAt:      { type: Date },
    taskCompletedAt:    { type: Date },
    cashReceivedAt:     { type: Date },
    declineHistory: [{
      staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      staffName:  { type: String },
      staffEmail: { type: String },
      reason:     { type: String },
      declinedAt: { type: Date, default: Date.now },
    }],

    // Team assignment (Home Cleaning & Sofa/Mattress require 3 staff)
    assignedTeam: [{
      staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      staffName:  { type: String },
      staffEmail: { type: String },
    }],

    // Admin attention flag — set when no replacement staff can be found
    needsAdminAttention:     { type: Boolean, default: false },
    adminNotificationReason: { type: String },

    // Home/Office cleaning specific
    houseSize:           { type: String },
    rooms:               { type: Number },
    bathrooms:           { type: Number },
    frequency:           { type: String },
    specialInstructions: { type: String },
    packageType:         { type: String },

    // Laundry specific
    laundryWeight:         { type: Number },
    laundryServices:       [{ type: String }],
    laundryItemType:       { type: String },
    laundryPickupDelivery: { type: Boolean },

    // Curtain specific
    curtainServiceType: { type: String },
    curtainOptions:     [{ type: String }],
    curtainQuantity:    { type: Number },

    // Sofa/Mattress/Carpet specific
    sofaUnits:          { type: Number },
    sofaSeatingCapacity:{ type: Number },
    mattressCount:      { type: Number },
    carpetCount:        { type: Number },
    carpetSquareFeet:   { type: Number },
    mattressSquareFeet: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
