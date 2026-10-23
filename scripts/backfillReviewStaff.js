// One-time backfill: reviewController.js's createReview did not set
// staffId/staffName/staffIds/staffNames until this was added — every
// review submitted before that change has those fields empty, so a
// staff member's own rating history/average would silently exclude
// them. This walks every review missing that data, looks up its
// linked booking, and fills it in from the booking's staff assignment
// (single assignedStaffId, or every member of assignedTeam for team
// bookings) — matching exactly what createReview does for new reviews.
//
// Run once from the backend folder:
//   node scripts/backfillReviewStaff.js

require('dotenv').config();
const mongoose = require('mongoose');
const Review  = require('../models/Review');
const Booking = require('../models/Booking');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const reviews = await Review.find({
    $or: [
      { staffIds: { $exists: false } },
      { staffIds: { $size: 0 } },
    ],
  });

  let updated = 0;
  let skippedNoBooking = 0;
  let skippedNoStaff = 0;

  for (const review of reviews) {
    if (!review.bookingId) { skippedNoBooking++; continue; }

    const booking = await Booking.findById(review.bookingId);
    if (!booking) { skippedNoBooking++; continue; }

    const teamMembers = Array.isArray(booking.assignedTeam) && booking.assignedTeam.length > 0
      ? booking.assignedTeam
      : (booking.assignedStaffId
          ? [{ staffId: booking.assignedStaffId, staffName: booking.assignedStaffName }]
          : []);

    if (teamMembers.length === 0) { skippedNoStaff++; continue; }

    review.staffId    = teamMembers[0].staffId || null;
    review.staffName  = teamMembers[0].staffName || null;
    review.staffIds   = teamMembers.map((m) => m.staffId).filter(Boolean);
    review.staffNames = teamMembers.map((m) => m.staffName).filter(Boolean);
    await review.save();
    updated++;
  }

  console.log(`Backfilled ${updated} review(s).`);
  console.log(`Skipped ${skippedNoBooking} (booking not found/linked).`);
  console.log(`Skipped ${skippedNoStaff} (booking has no staff assigned).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});