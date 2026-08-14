// Returns today's date as 'YYYY-MM-DD' using the server's LOCAL calendar day.
//
// Why not `new Date().toISOString().split('T')[0]`? toISOString() always
// converts to UTC, but booking.date is built on the frontend from the
// customer's local date (getFullYear/getMonth/getDate — see Booking.tsx's
// toLocalDateStr). Comparing a UTC-based "today" against a local-based
// booking.date silently disagrees for part of every day (e.g. the first ~5.5
// hours after midnight in Sri Lanka, UTC+5:30), which made isToday checks
// wrongly resolve to false — skipping the isAvailable filter and letting
// unavailable staff get auto-assigned to same-day bookings.
const getTodayLocalStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

module.exports = { getTodayLocalStr };
