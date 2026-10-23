const Settings = require('../models/Settings');

// ─── GET /api/settings ────────────────────────────────────────────────────────────
const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json({
      general:    settings.general,
      business:   settings.business,
      priceLists: settings.priceLists,
    });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
};

// ─── GET /api/settings/public/business ──────────────────────────────────────────────
// Public — no auth. Only exposes business contact info (name, address, emails,
// phones), never general/pricing settings, so the customer-facing site can
// show real contact details in its footer. Restored from the old
// settings.controller.js:getPublicBusinessInfo.
const getPublicBusinessInfo = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(settings.business);
  } catch (err) {
    console.error('getPublicBusinessInfo error:', err);
    res.status(500).json({ error: 'Failed to load business info' });
  }
};

// ─── PUT /api/settings/general ──────────────────────────────────────────────────────
const saveGeneral = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    settings.general = req.body;
    settings.markModified('general');
    await settings.save();
    res.json({ general: settings.general });
  } catch (err) {
    console.error('saveGeneral error:', err);
    res.status(500).json({ error: 'Failed to save general settings' });
  }
};

// ─── PUT /api/settings/business ─────────────────────────────────────────────────────
const saveBusiness = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    settings.business = req.body;
    settings.markModified('business');
    await settings.save();
    res.json({ business: settings.business });
  } catch (err) {
    console.error('saveBusiness error:', err);
    res.status(500).json({ error: 'Failed to save business settings' });
  }
};

// ─── PUT /api/settings/pricing/:serviceId ───────────────────────────────────────────
const savePricing = async (req, res) => {
  try {
    const serviceId = Number(req.params.serviceId);
    const { pricing } = req.body;
    const settings = await Settings.getSingleton();

    const idx = settings.priceLists.findIndex(p => p.serviceId === serviceId);
    if (idx >= 0) {
      // Was fully replacing the array element with just {serviceId, pricing},
      // discarding serviceName/category/pricingType on every price edit —
      // that's what silently moved a service out of its category into
      // "Unknown Pricing" the moment someone hit Save on Edit Prices.
      // Spread the existing record first so only `pricing` actually changes.
      settings.priceLists[idx] = { ...settings.priceLists[idx], pricing };
    } else {
      settings.priceLists.push({ serviceId, pricing });
    }
    settings.markModified('priceLists');
    await settings.save();

    res.json(settings.priceLists[idx >= 0 ? idx : settings.priceLists.length - 1]);
  } catch (err) {
    console.error('savePricing error:', err);
    res.status(500).json({ error: 'Failed to save pricing' });
  }
};

// ─── POST /api/settings/pricing ─────────────────────────────────────────────────────
// Adds a new service to the Pricing tab. Restored from the old
// settings.controller.js:createService, which used a separate PriceList
// model — that model doesn't exist in this codebase (a teammate's
// Service Discovery feature added its own `Service` model instead, wired
// up separately in controllers/serviceController.js). To avoid colliding
// with that unrelated model, this keeps services self-contained inside
// Settings.priceLists as full records ({serviceId, serviceName, category,
// pricingType, pricing}) instead of the {serviceId, pricing}-only shape
// savePricing assumed. Worth reconciling with the Service Discovery
// module later so there's one source of truth for services.
const createService = async (req, res) => {
  try {
    const { serviceName, category, pricingType, pricing } = req.body;
    if (!serviceName || !category || !pricingType || !pricing) {
      return res.status(400).json({ error: 'serviceName, category, pricingType and pricing are required' });
    }

    const settings = await Settings.getSingleton();
    // No auto-increment in use — next serviceId is just the current max + 1.
    const lastId = settings.priceLists.reduce((max, p) => Math.max(max, p.serviceId || 0), 0);
    const serviceId = lastId + 1;

    const created = { serviceId, serviceName, category, pricingType, pricing };
    settings.priceLists.push(created);
    settings.markModified('priceLists');
    await settings.save();

    res.status(201).json(created);
  } catch (err) {
    console.error('createService error:', err);
    res.status(500).json({ error: 'Failed to create service' });
  }
};

// ─── DELETE /api/settings/pricing/:serviceId ────────────────────────────────────────
const deleteService = async (req, res) => {
  try {
    const serviceId = Number(req.params.serviceId);
    const settings = await Settings.getSingleton();

    const idx = settings.priceLists.findIndex(p => p.serviceId === serviceId);
    if (idx === -1) return res.status(404).json({ error: 'Service not found' });

    settings.priceLists.splice(idx, 1);
    settings.markModified('priceLists');
    await settings.save();

    res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error('deleteService error:', err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
};

module.exports = {
  getSettings, getPublicBusinessInfo, saveGeneral, saveBusiness,
  savePricing, createService, deleteService,
};