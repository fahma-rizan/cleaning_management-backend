/**
 * Notification Template Controller
 * Manages creation, update, retrieval, and deletion of notification templates
 */

const NotificationTemplate = require('../models/NotificationTemplate');
const { AuditLog } = require('../models/AuditLog');

// Create a new notification template
const createNotificationTemplate = async (req, res) => {
  try {
    const { templateId, type, channel, subject, body, variables, isActive } = req.body;

    // Validate required fields
    if (!templateId || !type || !channel || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: templateId, type, channel, body',
      });
    }

    // Check if template already exists
    const existing = await NotificationTemplate.findOne({ templateId });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Template ID already exists' });
    }

    const template = new NotificationTemplate({
      templateId,
      type,
      channel,
      subject: subject || '',
      body,
      variables: variables || [],
      isActive: isActive !== undefined ? isActive : true,
    });

    await template.save();

    // Audit log
    await AuditLog.create({
      action: 'CREATE_NOTIFICATION_TEMPLATE',
      userId: req.user?.id,
      resourceType: 'NotificationTemplate',
      resourceId: template._id,
      details: { templateId },
    });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating notification template:', error);
    res.status(500).json({ success: false, error: 'Failed to create notification template' });
  }
};

// Get all notification templates
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
    res.status(500).json({ success: false, error: 'Failed to fetch notification templates' });
  }
};

// Get a single notification template by ID
const getNotificationTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findOne({ templateId });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching notification template:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notification template' });
  }
};

// Update a notification template
const updateNotificationTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { type, channel, subject, body, variables, isActive } = req.body;

    const template = await NotificationTemplate.findOne({ templateId });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Update fields if provided
    if (type) template.type = type;
    if (channel) template.channel = channel;
    if (subject !== undefined) template.subject = subject;
    if (body) template.body = body;
    if (variables) template.variables = variables;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();

    // Audit log
    await AuditLog.create({
      action: 'UPDATE_NOTIFICATION_TEMPLATE',
      userId: req.user?.id,
      resourceType: 'NotificationTemplate',
      resourceId: template._id,
      details: { templateId, changes: req.body },
    });

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error updating notification template:', error);
    res.status(500).json({ success: false, error: 'Failed to update notification template' });
  }
};

// Delete a notification template
const deleteNotificationTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await NotificationTemplate.findOneAndDelete({ templateId });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Audit log
    await AuditLog.create({
      action: 'DELETE_NOTIFICATION_TEMPLATE',
      userId: req.user?.id,
      resourceType: 'NotificationTemplate',
      resourceId: template._id,
      details: { templateId },
    });

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notification template' });
  }
};

// Render template with variables (preview)
const renderTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { variables: variableValues } = req.body;

    const template = await NotificationTemplate.findOne({ templateId });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    let renderedBody = template.body;
    let renderedSubject = template.subject;

    // Replace variables
    // FIX (C.7): missing values used to render as a blank string, so a
    // template with an unfilled variable (e.g. no customer_name supplied)
    // would send/preview with an ugly gap in the text. Falls back to a
    // sensible generic per common variable name, or '[variable]' otherwise,
    // so a missing value is visibly a placeholder rather than invisible.
    const FALLBACKS = {
      customer_name: 'Dear Customer',
      customerName: 'Dear Customer',
      service_name: 'your service',
      serviceName: 'your service',
    };
    template.variables.forEach((variable) => {
      const supplied = variableValues?.[variable];
      const value = (supplied !== undefined && supplied !== null && supplied !== '')
        ? supplied
        : (FALLBACKS[variable] ?? `[${variable}]`);
      const regex = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
      renderedBody = renderedBody.replace(regex, value);
      renderedSubject = renderedSubject.replace(regex, value);
    });

    res.json({
      success: true,
      data: {
        templateId,
        subject: renderedSubject,
        body: renderedBody,
      },
    });
  } catch (error) {
    console.error('Error rendering template:', error);
    res.status(500).json({ success: false, error: 'Failed to render template' });
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
