const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId:     { type: String, required: true },
    userEmail:  { type: String, required: true },
    action:     { type: String, required: true },
    resource:   { type: String, required: true },
    resourceId: { type: String },
    details:    { type: mongoose.Schema.Types.Mixed },
    ipAddress:  { type: String },
    userAgent:  { type: String },
    status: {
      type: String,
      enum: ['success', 'failure', 'warning'],
      default: 'success',
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
