const mongoose = require('mongoose');

/**
 * Singleton settings document — there is only ever one row.
 * general/business are free-form objects (admin panel controls their shape);
 * pricing is keyed by serviceId so each service's pricing can be edited independently.
 */
const settingsSchema = new mongoose.Schema(
  {
    general:    { type: mongoose.Schema.Types.Mixed, default: {} },
    business:   { type: mongoose.Schema.Types.Mixed, default: {} },
    priceLists: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ serviceId, pricing: {...} }]
  },
  { timestamps: true }
);

settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
