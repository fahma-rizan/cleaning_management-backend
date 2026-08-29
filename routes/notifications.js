const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE ORDER MATTERS — literal routes MUST come before dynamic /:id routes.
// Express matches top-to-bottom. If /:id is above /mark-all-read, then
// "mark-all-read" is treated as the id param and the route never fires.
// FIX: All literal/named routes are now defined BEFORE /:id routes.
// ─────────────────────────────────────────────────────────────────────────────

// --- @route   POST /api/notifications ---
// @desc    Create a notification for the authenticated user, OR — for staff/
//          admin/manager callers only — for another user they name in the body.
// @access  Private (self-notify); staff/admin/manager (notify-another-user)
//
// FIX (re-fix): an earlier round removed the public POST / that accepted an
// arbitrary userId from the body, to stop unauthenticated spam — but that
// also broke every legitimate admin/staff "notify the customer" action
// (worker arrival, job completion, price-reduction/refund updates, payment
// reminders sent this way — utils/notificationUtils.ts's addNotification()
// always sends the intended recipient's userId in the body). The route was
// silently substituting req.user.id, so every one of those notifications was
// landing in the admin's/staff member's own inbox instead of the customer's.
// Fix: honor req.body.userId, but ONLY when the caller is staff/admin/manager
// (role-checked via staffOnly below, not just "any authenticated user") —
// this keeps the original spam fix (a plain customer still can't target
// anyone but themselves) while restoring the actual admin-to-customer flow.
router.post('/', auth, async (req, res) => {
  try {
    const { type, title, message, actionUrl, bookingId } = req.body;
    const requestedUserId = req.body.userId;
    const isPrivileged = ['admin', 'manager', 'staff'].includes(req.user.role);

    // A privileged caller may target another user; everyone else can only
    // ever create a notification for themselves, regardless of what (if
    // anything) they pass in the body.
    const userId = (isPrivileged && requestedUserId) ? requestedUserId : req.user.id;

    if (!type || !title || !message) {
      return res.status(400).json({ message: 'Missing required fields: type, title, message' });
    }

    const newNotification = await Notification.create({
      userId, type, title, message, actionUrl, bookingId,
    });

    res.status(201).json(newNotification);
  } catch (error) {
    console.error('--- ERROR CREATING NOTIFICATION ---', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   GET /api/notifications ---
// @desc    Get all notifications for the authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    console.error('--- ERROR GETTING NOTIFICATIONS ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   PUT /api/notifications/mark-all-read ---
// @desc    Mark all notifications for the authenticated user as read
// @access  Private
//
// FIX: Moved ABOVE /:id/read. Previously Express was matching "mark-all-read"
// as the :id param value, so this route could never be reached.
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('--- ERROR MARKING ALL READ ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   DELETE /api/notifications/all ---
// @desc    Delete all notifications for the authenticated user
// @access  Private
//
// FIX: Moved ABOVE /:id. Previously Express matched "all" as the :id param,
// so this route was also unreachable.
router.delete('/all', auth, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.id });
    res.status(200).json({ message: 'All notifications deleted' });
  } catch (error) {
    console.error('--- ERROR DELETING ALL NOTIFICATIONS ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   GET /api/notifications/user/:userId ---
// @desc    Get all notifications for a specific user
// @access  Private
//
// FIX: Added auth middleware and ownership check. Previously this was fully
// public — any unauthenticated request could read any user's notifications
// (payment amounts, booking IDs, refund statuses) by guessing their userId.
router.get('/user/:userId', auth, async (req, res) => {
  try {
    // Ensure the requesting user can only see their own notifications
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You cannot access another user\'s notifications.' });
    }

    const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    console.error('--- ERROR GETTING USER NOTIFICATIONS ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   PUT /api/notifications/:id/read ---
// @desc    Mark a single notification as read
// @access  Private
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (String(notification.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden: You cannot modify this notification.' });
    }

    notification.read = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    console.error('--- ERROR MARKING READ ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- @route   DELETE /api/notifications/:id ---
// @desc    Delete a single notification
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (String(notification.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden: You cannot delete this notification.' });
    }

    await notification.deleteOne();
    res.status(200).json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('--- ERROR DELETING NOTIFICATION ---', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;