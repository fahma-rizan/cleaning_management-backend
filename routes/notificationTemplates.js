const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  createNotificationTemplate,
  getNotificationTemplates,
  getNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  renderTemplate,
} = require('../controllers/notificationTemplateController');

router.use(protect);

router.post('/',                    adminOnly, createNotificationTemplate);
router.get('/',                     getNotificationTemplates);
router.get('/:templateId',          getNotificationTemplate);
router.put('/:templateId',          adminOnly, updateNotificationTemplate);
router.delete('/:templateId',       adminOnly, deleteNotificationTemplate);
router.post('/:templateId/render',  renderTemplate);

module.exports = router;
