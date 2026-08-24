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

// Formats a Date object as 'YYYY-MM-DD' using its LOCAL calendar day (same
// convention as getTodayLocalStr / the frontend's toLocalDateStr) — never
// use toISOString() here for the same reason noted above.
const toLocalDateStr = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Adds `days` WORKING days (Mon-Fri, Sat/Sun skipped) to a 'YYYY-MM-DD'
// date string. Used to auto-calculate a laundry booking's delivery date
// from its pickup date (2 working days later).
const addWorkingDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) added++;
  }
  return toLocalDateStr(date);
};

module.exports = { getTodayLocalStr, toLocalDateStr, addWorkingDays };
