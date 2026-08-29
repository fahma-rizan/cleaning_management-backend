const Counter = require('../models/Counter');

/**
 * Maps a service name to one of the 4 major categories: LND, CUR, SVC, HOC
 *
 * FIX 1: Added missing HOC keywords — 'home', 'apartment', 'villa',
 *         'residential'. Previously "Home Cleaning" returned null because
 *         only 'house' was in the list, silently dropping that category
 *         from multi-service invoices.
 *
 * FIX 2: Added missing SVC keywords — 'shampoo', 'vacuum'.
 *         "Shampoo Vacuum" is a core service type but was not recognised.
 *
 * @param {string} serviceName
 * @returns {string|null} Category code or null if unrecognised
 */
const getCategoryFromService = (serviceName) => {
  const name = serviceName.toLowerCase();

  // Laundry (LND) — check before CUR because "Curtain Washing" contains 'wash'
  if (
    name.includes('laundry') ||
    name.includes('wash') ||
    name.includes('dry cleaning') ||
    name.includes('pressing') ||
    name.includes('ironing')
  ) {
    // Special case: "Curtain Washing" contains 'wash' but belongs to CUR
    if (name.includes('curtain')) return 'CUR';
    return 'LND';
  }

  // Curtain Cleaning (CUR)
  if (name.includes('curtain')) {
    return 'CUR';
  }

  // Shampoo / Vacuum Cleaning (SVC)
  if (
    name.includes('sofa') ||
    name.includes('mattress') ||
    name.includes('carpet') ||
    name.includes('shampoo') ||   // FIX 2: was missing
    name.includes('vacuum')        // FIX 2: was missing
  ) {
    return 'SVC';
  }

  // Home / Office Cleaning (HOC)
  if (
    name.includes('home') ||         // FIX 1: was missing — "Home Cleaning" → null before
    name.includes('house') ||
    name.includes('apartment') ||    // FIX 1: was missing
    name.includes('villa') ||        // FIX 1: was missing
    name.includes('residential') ||  // FIX 1: was missing
    name.includes('office') ||
    name.includes('general cleaning') ||
    name.includes('deep cleaning') ||
    name.includes('commercial') ||
    name.includes('floor')
  ) {
    return 'HOC';
  }

  return null; // Unrecognised service — will use GEN prefix
};

/**
 * Determines the invoice prefix and unique categories for a list of service items.
 *
 * Returns:
 *   - prefix: 'LND' | 'CUR' | 'SVC' | 'HOC' | 'MULTI' | 'GEN'
 *   - categories: string[]  e.g. ['HOC', 'LND']
 *
 * Note: 'MULTI' is used only as the invoice number prefix. It is NOT stored
 * in mainCategories (which has enum ['LND','CUR','SVC','HOC']). The individual
 * detected categories are stored in mainCategories instead.
 *
 * @param {Array<{name: string, price: number}>} serviceItems
 * @returns {{ prefix: string, categories: string[] }}
 */
const determineInvoiceDetails = (serviceItems) => {
  if (!serviceItems || serviceItems.length === 0) {
    return { prefix: 'GEN', categories: [] };
  }

  const categoriesSet = new Set();
  serviceItems.forEach(item => {
    const cat = getCategoryFromService(item.name);
    if (cat) categoriesSet.add(cat);
  });

  const categories = Array.from(categoriesSet);

  if (categories.length === 0) {
    return { prefix: 'GEN', categories: [] };
  }

  if (categories.length > 1) {
    return { prefix: 'MULTI', categories }; // categories stores the actual types, e.g. ['HOC','LND']
  }

  return { prefix: categories[0], categories };
};

/**
 * Generates a unique sequential invoice number.
 *
 * FIX: Counter key changed from the hardcoded string 'invoiceNumber' to the
 * prefix value itself. Previously all invoice types shared one global counter,
 * so sequences had gaps per category (LND-0001, LND-0004, LND-0009...).
 * Now each prefix has its own independent sequence:
 *   LND-20260604-0001, LND-20260604-0002 ...
 *   HOC-20260604-0001, HOC-20260604-0002 ...  (independent)
 *   MULTI-20260604-0001 ...                    (independent)
 *
 * @param {string} prefix - Category prefix (LND, CUR, SVC, HOC, MULTI, GEN)
 * @returns {Promise<string>} Formatted invoice number e.g. "MULTI-20260604-0001"
 */
const generateInvoiceNumber = async (prefix) => {
  const counter = await Counter.findByIdAndUpdate(
    prefix,  // FIX: use prefix as key — each category gets its own sequence
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sequenceStr = counter.seq.toString().padStart(4, '0');

  return `INV-${prefix}-${dateStr}-${sequenceStr}`;
};

module.exports = {
  getCategoryFromService,
  determineInvoiceDetails,
  generateInvoiceNumber,
};