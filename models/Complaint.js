const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  adminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  adminName: { type: String, required: true },
  note:      { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

const ComplaintSchema = new mongoose.Schema({
  title:             { type: String, required: true },
  description:       { type: String, default: '' },
  customerId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName:      { type: String, required: true },
  serviceName:       { type: String, required: true },
  serviceDate:       { type: Date, required: true },
  assignedStaff:     { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
  assignedStaffName: { type: String, default: '' },
  priority:          { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  status:            { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
  notes:             { type: [NoteSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Complaint', ComplaintSchema);