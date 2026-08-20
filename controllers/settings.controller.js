const Settings  = require('../models/Settings');
const PriceList = require('../models/PriceList');

exports.get = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    const priceLists = await PriceList.find().sort({ serviceId: 1 });
    res.json({ ...settings.toObject(), priceLists });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// Public — no auth. Only exposes the business contact info (name, address,
// emails, phones), never general/pricing settings, so the customer-facing
// site can show real contact details in its footer.
exports.getPublicBusinessInfo = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json(settings.business);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.saveGeneral = async (req, res) => {
  try {
    const { businessHours, operatingDays, cancellationPolicy, durations, holidays } = req.body;
    const settings = await Settings.findOneAndUpdate({}, { $set: { 'general.businessHours': businessHours, 'general.operatingDays': operatingDays, 'general.cancellationPolicy': cancellationPolicy, 'general.durations': durations, 'general.holidays': holidays, updatedBy: req.admin.id } }, { new: true, upsert: true });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.saveBusiness = async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate({}, { $set: { business: req.body, updatedBy: req.admin.id } }, { new: true, upsert: true });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.savePricing = async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId);
    const { pricing } = req.body;
    const updated = await PriceList.findOneAndUpdate({ serviceId }, { $set: { pricing } }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.createService = async (req, res) => {
  try {
    const { serviceName, category, pricingType, pricing } = req.body;
    if (!serviceName || !category || !pricingType || !pricing) {
      return res.status(400).json({ error: 'serviceName, category, pricingType and pricing are required' });
    }
    // No auto-increment plugin in use — next serviceId is just the current max + 1.
    const last = await PriceList.findOne().sort({ serviceId: -1 });
    const serviceId = last ? last.serviceId + 1 : 1;
    const created = await PriceList.create({ serviceId, serviceName, category, pricingType, pricing });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

exports.deleteService = async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId);
    const deleted = await PriceList.findOneAndDelete({ serviceId });
    if (!deleted) return res.status(404).json({ error: 'Service not found' });
    res.json({ message: 'Service deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};