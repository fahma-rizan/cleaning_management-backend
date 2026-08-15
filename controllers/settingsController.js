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
      settings.priceLists[idx] = { serviceId, pricing };
    } else {
      settings.priceLists.push({ serviceId, pricing });
    }
    settings.markModified('priceLists');
    await settings.save();

    res.json({ serviceId, pricing });
  } catch (err) {
    console.error('savePricing error:', err);
    res.status(500).json({ error: 'Failed to save pricing' });
  }
};

module.exports = { getSettings, saveGeneral, saveBusiness, savePricing };
