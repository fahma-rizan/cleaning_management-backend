const Settings = require('../models/Settings');

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

module.exports = { getPriceList };
