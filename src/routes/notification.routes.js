const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll,
} = require('../controllers/notification.controller');

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.delete('/', clearAll);

router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;
