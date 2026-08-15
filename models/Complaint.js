const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    bookingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName:  { type: String },
    serviceName:   { type: String },
    serviceDate:   { type: String },

    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    status: {
      type:    String,
      enum:    ['Pending', 'In Progress', 'Resolved'],
      default: 'Pending',
    },
    priority: {
      type:    String,
      enum:    ['Low', 'Medium', 'High'],
      default: 'Medium',
    },

    assignedStaffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedStaffName: { type: String },

    notes: [{
      adminName: { type: String },
      note:      { type: String },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
