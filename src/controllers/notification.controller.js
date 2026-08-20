const Notification = require('../models/Notification');

// ─── GET /api/notifications ───────────────────────────────────────────────────
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter((n) => !n.read).length;

    res.json({ success: true, unreadCount, notifications });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/notifications/:id/read ─────────────────────────────────────────
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/notifications/read-all ─────────────────────────────────────────
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/notifications  (clear all) ───────────────────────────────────
const clearAll = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ success: true, message: 'All notifications cleared.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification, clearAll };
