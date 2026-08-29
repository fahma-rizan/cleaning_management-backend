const express = require('express');
const {
  createNotificationTemplate,
  getNotificationTemplates,
  getNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  renderTemplate,
} = require('../controllers/notificationTemplateController');
// FIX: auth.js exports a bare function (module.exports = auth), not { verifyToken }.
// Destructuring a bare function gives undefined, crashing every route.
const verifyToken = require('../middleware/auth');
const { adminOnly } = require('../middleware/authorization');

const router = express.Router();

/**
 * Notification Template Routes
 * Templates are managed by admins; used by system for notifications
 */

// POST /api/notification-templates - Create new template (admin only)
router.post('/', verifyToken, adminOnly, createNotificationTemplate);

// GET /api/notification-templates - List all templates
router.get('/', verifyToken, getNotificationTemplates);

// GET /api/notification-templates/:templateId - Get single template
router.get('/:templateId', verifyToken, getNotificationTemplate);

// PUT /api/notification-templates/:templateId - Update template (admin only)
router.put('/:templateId', verifyToken, adminOnly, updateNotificationTemplate);

// DELETE /api/notification-templates/:templateId - Delete template (admin only)
router.delete('/:templateId', verifyToken, adminOnly, deleteNotificationTemplate);

// POST /api/notification-templates/:templateId/render - Preview template with variables
router.post('/:templateId/render', verifyToken, renderTemplate);

module.exports = router;
