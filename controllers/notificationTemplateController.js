/**
 * Notification Template Controller
 * Manages creation, update, retrieval, and deletion of notification templates.
 * Ported from backend-payment-workflow.
 *
 * FIX: source branch did `const { AuditLog } = require('../models/AuditLog')`
 * but AuditLog.js default-exports the model directly (`module.exports =
 * mongoose.model(...)`) — the destructure gave `undefined`, so every
 * AuditLog.create() call there would have thrown. Also adapted field names
 * to this repo's actual AuditLog schema: `resource`/`resourceId` (not
 * `resourceType`), and `userEmail` is a required field here.
 */

const NotificationTemplate = require('../models/NotificationTemplate');
const AuditLog = require('../models/AuditLog');

const logAudit = (req, action, resourceId, details) =>
  AuditLog.create({
    action,
    userId:    req.user?._id?.toString() || 'system',
    userEmail: req.user?.email || 'system',
    resource:  'NotificationTemplate',
    resourceId,
    details,
  }).catch((err) => console.error('Audit log failed:', err.message));

// ─── POST /api/notification-templates (admin only) ─────────────────────────────
const createNotificationTemplate = async (req, res) => {
  try {
    const { templateId, type, channel, subject, body, variables, isActive } = req.body;

    if (!templateId || !type || !channel || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: templateId, type, channel, body',
      });
    }

    const existing = await NotificationTemplate.findOne({ templateId });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Template ID already exists' });
    }

    const template = await NotificationTemplate.create({
      templateId,
      type,
      channel,
      subject: subject || '',
      body,
      variables: variables || [],
      isActive: isActive !== undefined ? isActive : true,
    });

    await logAudit(req, 'CREATE_NOTIFICATION_TEMPLATE', template._id, { templateId });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating notification template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── GET /api/notification-templates ────────────────────────────────────────────
const getNotificationTemplates = async (req, res) => {
  try {
    const { type, channel, isActive } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (channel) filter.channel = channel;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const templates = await NotificationTemplate.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching notification templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── GET /api/notification-templates/:templateId ────────────────────────────────
const getNotificationTemplate = async (req, res) => {
  try {
    const template = await NotificationTemplate.findOne({ templateId: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching notification template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── PUT /api/notification-templates/:templateId (admin only) ──────────────────
const updateNotificationTemplate = async (req, res) => {
  try {
    const { type, channel, subject, body, variables, isActive } = req.body;
    const template = await NotificationTemplate.findOne({ templateId: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    if (type) template.type = type;
    if (channel) template.channel = channel;
    if (subject !== undefined) template.subject = subject;
    if (body) template.body = body;
    if (variables) template.variables = variables;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();
    await logAudit(req, 'UPDATE_NOTIFICATION_TEMPLATE', template._id, { templateId: req.params.templateId, changes: req.body });

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error updating notification template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── DELETE /api/notification-templates/:templateId (admin only) ──────────────
const deleteNotificationTemplate = async (req, res) => {
  try {
    const template = await NotificationTemplate.findOneAndDelete({ templateId: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    await logAudit(req, 'DELETE_NOTIFICATION_TEMPLATE', template._id, { templateId: req.params.templateId });

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── POST /api/notification-templates/:templateId/render ──────────────────────
// Preview: fills {{variable}} placeholders with supplied values.
const renderTemplate = async (req, res) => {
  try {
    const { variables: variableValues } = req.body;
    const template = await NotificationTemplate.findOne({ templateId: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    let renderedBody = template.body;
    let renderedSubject = template.subject || '';

    template.variables.forEach((variable) => {
      const value = variableValues?.[variable] || '';
      const regex = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
      renderedBody = renderedBody.replace(regex, value);
      renderedSubject = renderedSubject.replace(regex, value);
    });

    res.json({ success: true, data: { templateId: req.params.templateId, subject: renderedSubject, body: renderedBody } });
  } catch (error) {
    console.error('Error rendering template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createNotificationTemplate,
  getNotificationTemplates,
  getNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  renderTemplate,
};
