const Notification = require('../models/Notification');

// ─── POST /api/notifications ───────────────────────────────────────────────────
const createNotification = async (req, res) => {
  try {
    const { userId, type, title, message, bookingId, actionUrl, complaintId } = req.body;
    if (!userId || !type || !title || !message) {
      return res.status(400).json({ message: 'userId, type, title and message are required.' });
    }
    const notification = await Notification.create({ userId, type, title, message, bookingId, actionUrl, complaintId });
    req.app.get('io')?.emit('notification', notification);
    res.status(201).json(notification);
  } catch (err) {
    console.error('createNotification error:', err);
    res.status(500).json({ message: 'Failed to create notification.' });
  }
};

// ─── GET /api/notifications/user/:userId ───────────────────────────────────────
const getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error('getUserNotifications error:', err);
    res.status(500).json({ message: 'Failed to load notifications.' });
  }
};

// ─── PUT /api/notifications/:id/read ────────────────────────────────────────────
const markRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json(notification);
  } catch (err) {
    console.error('markRead error:', err);
    res.status(500).json({ message: 'Failed to update notification.' });
  }
};

// ─── PUT /api/notifications/mark-all-read/:userId ──────────────────────────────
const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.params.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    console.error('markAllRead error:', err);
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
};

// ─── DELETE /api/notifications/user/:userId ────────────────────────────────────
const deleteAllForUser = async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteAllForUser error:', err);
    res.status(500).json({ message: 'Failed to delete notifications.' });
  }
};

// ─── DELETE /api/notifications/:id ──────────────────────────────────────────────
const deleteOne = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteOne error:', err);
    res.status(500).json({ message: 'Failed to delete notification.' });
  }
};

module.exports = { createNotification, getUserNotifications, markRead, markAllRead, deleteAllForUser, deleteOne };
