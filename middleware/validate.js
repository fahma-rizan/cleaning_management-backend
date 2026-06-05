const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const data = source === 'query' ? req.query : req.body;
    schema.parse(data);
    next();
  } catch (err) {
    // Zod v4 uses err.issues; v3 used err.errors
    const issues = err.issues ?? err.errors ?? [];
    if (Array.isArray(issues) && issues.length > 0) {
      const message = issues
        .map(e => `${(e.path || []).join('.')}: ${e.message}`)
        .join(', ');
      return res.status(400).json({ success: false, message });
    }
    next(err);
  }
};

module.exports = validate;
