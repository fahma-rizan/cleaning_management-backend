const mongoose = require('mongoose');

/**
 * GPS STATUS LOG — one document PER BOOKING, holding all three
 * status-change timestamps together. Separate from Booking (which keeps
 * its own taskStartedAt/taskCompletedAt for core business logic unrelated
 * to GPS) and from User's gpsStatus/currentLat/currentLng (which is just
 * the current live-tracking snapshot, overwritten on every position
 * update). Each event (onTheWayAt / onSiteAt / completedAt) is written via
 * an upsert keyed on bookingId, so a single record accumulates the full
 * timeline for that job instead of three separate log entries.
 */
const gpsStatusLogSchema = new mongoose.Schema(
  {
    bookingId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    staffId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    onTheWayAt:  { type: Date },
    onSiteAt:    { type: Date },
    completedAt: { type: Date },
    // Last known position at the moment "On the Way" was confirmed.
    latitude:    { type: Number },
    longitude:   { type: Number },
  },
  { timestamps: true }, // adds createdAt/updatedAt automatically
);

module.exports = mongoose.model('GpsStatusLog', gpsStatusLogSchema);