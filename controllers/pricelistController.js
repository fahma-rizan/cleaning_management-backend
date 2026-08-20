const Settings = require('../models/Settings');

// ─── GET /api/pricelists ────────────────────────────────────────────────────────
// Public — returns every service's price list. Backed by the same
// Settings.priceLists store the admin Settings > Pricing tab edits (and that
// getPriceList below reads one entry from), so this is always in sync with
// whatever the admin has configured there. Used by AIEstimator.tsx, which
// expects { success: true, priceLists: [...] }.
const getAllPriceLists = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json({ success: true, priceLists: settings.priceLists || [] });
  } catch (err) {
    console.error('getAllPriceLists error:', err);
    res.status(500).json({ success: false, error: 'Failed to load price lists' });
  }
};

// ─── GET /api/pricelists/:serviceId ────────────────────────────────────────────
// Public — customer-facing price lists (Dry Cleaning=9, Washing&Pressing=10,
// Pressing=11). Backed by the same Settings.priceLists store the admin
// Settings > Pricing tab edits, so admin changes reflect here immediately.
const getPriceList = async (req, res) => {
  try {
    const serviceId = Number(req.params.serviceId);
    const settings = await Settings.getSingleton();
    const entry = settings.priceLists.find(p => p.serviceId === serviceId);

    if (!entry) {
      return res.status(404).json({ error: 'No price list found for this service' });
    }

    res.json({ priceList: entry });
  } catch (err) {
    console.error('getPriceList error:', err);
    res.status(500).json({ error: 'Failed to load price list' });
  }
};

module.exports = { getAllPriceLists, getPriceList };
