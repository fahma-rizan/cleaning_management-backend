const mongoose = require('mongoose');

/**
 * FEEDBACK / COMPLAINT MODEL (task #21, Notification C.3a)
 *
 * Was entirely missing before this — the audit found a "Complaints" nav item
 * in AdminSidebar that just pointed at the Financial Dashboard as a
 * placeholder, and no way for a customer to leave feedback or file a
 * complaint about a completed job anywhere in the app.
 *
 * One schema covers both FEEDBACK (a star rating + optional comment) and
 * COMPLAINT (a specific problem needing an admin response) — they share the
 * same lifecycle (submitted → admin reviews → responded/resolved) and the
 * same "which booking is this about" context, so a single collection with a
 * `type` discriminator is simpler than two parallel ones.
 */
const feedbackSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    customer: {
      userId: { type: String },
      name:   { type: String },
      email:  { type: String },
      phone:  { type: String },
    },
    type: {
      type: String,
      enum: ['FEEDBACK', 'COMPLAINT'],
      required: true,
    },
    category: {
      type: String,
      enum: ['SERVICE_QUALITY', 'STAFF_BEHAVIOR', 'DAMAGE', 'LATE_ARRIVAL', 'BILLING', 'OTHER'],
      default: 'OTHER',
    },
    // Required for FEEDBACK (star rating), not applicable to COMPLAINT.
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: [true, 'A comment is required.'],
      trim: true,
    },
    // Evidence photos for a complaint (e.g. damage) — same shape as
    // PriceReduction.photos so the admin UI can reuse the same rendering.
    photos: [{
      url: String,
      description: String,
    }],
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
    },
    adminResponse: { type: String, trim: true },
    respondedAt:   { type: Date },
    respondedBy:   { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
