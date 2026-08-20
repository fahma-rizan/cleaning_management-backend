const Booking = require('../models/Booking');

// For each staff id, average the rating of every review attached to a
// booking that staff worked on — either as the primary assignee
// (assignedStaffId) or as part of the team (assignedTeam[].staffId).
// Reviews link to a booking via the human-readable string `bookingId`
// (not Mongo's _id), so the join has to go through that field.
//
// Shared between staff.controller.js (Staff Management page) and
// reports.controller.js (Staff Performance Report) so both always show
// the same number — this used to live only in staff.controller.js and
// the report read a stale, never-updated `rating` field straight off the
// User document instead.
const getStaffRatingStats = async (staffIds) => {
  if (!staffIds.length) return new Map();
  const staffIdStrs = staffIds.map((id) => String(id));

  const rawStats = await Booking.aggregate([
    {
      // One combined list of every staff id on this booking — the
      // primary assignee plus the whole team — so single- and
      // multi-staff bookings are both covered from one place.
      $addFields: {
        allStaffIds: {
          $setUnion: [
            { $cond: [{ $ifNull: ['$assignedStaffId', false] }, ['$assignedStaffId'], []] },
            { $map: { input: { $ifNull: ['$assignedTeam', []] }, as: 't', in: '$$t.staffId' } },
          ],
        },
      },
    },
    { $match: { allStaffIds: { $ne: [] } } },
    { $unwind: '$allStaffIds' }, // one row per (booking, staff) pair
    {
      $project: {
        staffIdStr: { $toString: '$allStaffIds' },
        bookingId: 1,
      },
    },
    {
      $lookup: {
        from: 'reviews',
        localField: 'bookingId',
        foreignField: 'bookingId',
        as: 'review',
      },
    },
    { $unwind: '$review' }, // drop bookings with no review — nothing to average
    {
      $group: {
        _id: '$staffIdStr',
        avgRating: { $avg: '$review.rating' },
        reviewCount: { $sum: 1 },
      },
    },
    { $match: { _id: { $in: staffIdStrs } } },
  ]);

  return new Map(rawStats.map((row) => [row._id, row]));
};

// Count of completed bookings per staff — primary assignee or team member.
// Deliberately separate from getStaffRatingStats above: a completed job
// doesn't require a review to count here, whereas the rating average only
// makes sense over bookings that actually have one.
const getStaffJobCounts = async (staffIds) => {
  if (!staffIds.length) return new Map();
  const staffIdStrs = staffIds.map((id) => String(id));

  const rawCounts = await Booking.aggregate([
    { $match: { status: 'completed' } },
    {
      $addFields: {
        allStaffIds: {
          $setUnion: [
            { $cond: [{ $ifNull: ['$assignedStaffId', false] }, ['$assignedStaffId'], []] },
            { $map: { input: { $ifNull: ['$assignedTeam', []] }, as: 't', in: '$$t.staffId' } },
          ],
        },
      },
    },
    { $match: { allStaffIds: { $ne: [] } } },
    { $unwind: '$allStaffIds' },
    {
      $group: {
        _id: { $toString: '$allStaffIds' },
        jobsCompleted: { $sum: 1 },
      },
    },
    { $match: { _id: { $in: staffIdStrs } } },
  ]);

  return new Map(rawCounts.map((row) => [row._id, row.jobsCompleted]));
};

module.exports = { getStaffRatingStats, getStaffJobCounts };