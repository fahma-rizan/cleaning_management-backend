const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createNotification, getUserNotifications, markRead, markAllRead, deleteAllForUser, deleteOne,
} = require('../controllers/notificationController');

router.use(protect);

router.post('/',                       createNotification);
router.get('/user/:userId',            getUserNotifications);
router.put('/:id/read',                markRead);
router.put('/mark-all-read/:userId',   markAllRead);
router.delete('/user/:userId',         deleteAllForUser);
router.delete('/:id',                  deleteOne);

module.exports = router;
