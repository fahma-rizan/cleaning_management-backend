const Service = require('../models/Service');

// ─── GET /api/services ──────────────────────────────────────────────────────────
// Public — customer-facing service catalog listing, with optional category/search filters.
const getAllServices = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };

    if (category && category !== 'all') {
      filter.category = category;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const services = await Service.find(filter).sort({ serviceId: 1 });
    res.json({ success: true, count: services.length, services });
  } catch (err) {
    console.error('getAllServices error:', err);
    res.status(500).json({ success: false, message: 'Failed to load services.' });
  }
};

// ─── GET /api/services/:id ───────────────────────────────────────────────────────
const getServiceById = async (req, res) => {
  try {
    const service = await Service.findOne({ serviceId: req.params.id, isActive: true });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }
    res.json({ success: true, service });
  } catch (err) {
    console.error('getServiceById error:', err);
    res.status(500).json({ success: false, message: 'Failed to load service.' });
  }
};

// ─── POST /api/services (admin only) ────────────────────────────────────────────
const createService = async (req, res) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json({ success: true, service });
  } catch (err) {
    console.error('createService error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create service.' });
  }
};

// ─── PUT /api/services/:id (admin only) ─────────────────────────────────────────
const updateService = async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { serviceId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }
    res.json({ success: true, service });
  } catch (err) {
    console.error('updateService error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update service.' });
  }
};

// ─── DELETE /api/services/:id (admin only — soft delete) ───────────────────────
const deleteService = async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { serviceId: req.params.id },
      { isActive: false },
      { new: true }
    );
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }
    res.json({ success: true, message: 'Service deactivated.' });
  } catch (err) {
    console.error('deleteService error:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate service.' });
  }
};

module.exports = { getAllServices, getServiceById, createService, updateService, deleteService };
