const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      description: 'Unique identifier for the template (e.g., tpl_payment_success)',
    },
    type: {
      type: String,
      enum: ['payment', 'invoice', 'booking', 'refund', 'system'],
      required: true,
      description: 'Category of notification (payment, invoice, booking, refund, system)',
    },
    channel: {
      type: String,
      enum: ['email', 'in-app', 'sms'],
      required: true,
      description: 'Delivery channel (email, in-app, sms)',
    },
    subject: {
      type: String,
      description: 'Email subject line (if channel is email)',
    },
    body: {
      type: String,
      required: true,
      description: 'Template body with {{variable}} placeholders',
    },
    variables: {
      type: [String],
      default: [],
      description: 'List of variable names expected in the template',
    },
    isActive: {
      type: Boolean,
      default: true,
      description: 'Whether the template is currently active',
    },
  },
  {
    timestamps: true,
    collection: 'notificationTemplates',
  }
);

// Index for quick lookups
notificationTemplateSchema.index({ type: 1, channel: 1 });
notificationTemplateSchema.index({ isActive: 1 });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
