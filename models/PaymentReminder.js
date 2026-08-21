const mongoose = require('mongoose');

// Logs every automated balance-due reminder sent, so the scheduler never
// sends the same reminder type twice for the same invoice.
const paymentReminderSchema = new mongoose.Schema(
  {
    invoiceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, required: true },
    customerId:    { type: String, required: true },
    customerEmail: { type: String, required: true },
    amount:        { type: Number, required: true },
    dueDate:       { type: Date, required: true },
    reminderType: {
      type:     String,
      enum:     ['first', 'second', 'final', 'overdue'],
      required: true,
    },
    sentAt:  { type: Date, default: Date.now },
    status: {
      type:    String,
      enum:    ['sent', 'failed', 'pending'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

paymentReminderSchema.index({ invoiceId: 1, reminderType: 1 });
paymentReminderSchema.index({ customerId: 1 });
paymentReminderSchema.index({ sentAt: -1 });

module.exports = mongoose.model('PaymentReminder', paymentReminderSchema);
