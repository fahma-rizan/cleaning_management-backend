const mongoose = require('mongoose');

// Admin-managed notification templates (email/in-app/sms), stored in the DB
// rather than hardcoded — ported from backend-payment-workflow. Separate from
// the hardcoded TEMPLATES map in controllers/emailController.js; that one
// keeps working as-is for the existing customer-facing Email Templates page.
const notificationTemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, unique: true, trim: true },
    type: {
      type:     String,
      enum:     ['payment', 'invoice', 'booking', 'refund', 'system'],
      required: true,
    },
    channel: {
      type:     String,
      enum:     ['email', 'in-app', 'sms'],
      required: true,
    },
    subject:   { type: String },
    body:      { type: String, required: true }, // {{variable}} placeholders
    variables: { type: [String], default: [] },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'notificationTemplates' }
);

notificationTemplateSchema.index({ type: 1, channel: 1 });
notificationTemplateSchema.index({ isActive: 1 });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
