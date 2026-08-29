/**
 * Shared Service Types — single source of truth
 *
 * A.6 Payment Report Export — Fix 1
 * ==================================
 * The service type filter dropdown values and the actual serviceType values
 * stored on records must use exactly the same source of truth.  This file is
 * imported by both the backend (routes + controllers) and the frontend
 * (PaymentReportExport.tsx) so that no filter option ever exists that doesn't
 * match how records are actually labeled, and vice-versa.
 */

const SERVICE_TYPES = [
  { value: 'Home Cleaning',       label: 'Home Cleaning',       category: 'HOC' },
  { value: 'Office Cleaning',     label: 'Office Cleaning',     category: 'HOC' },
  { value: 'Laundry',             label: 'Laundry',             category: 'LND' },
  { value: 'Curtain Cleaning',    label: 'Curtain Cleaning',    category: 'CUR' },
  { value: 'Sofa Cleaning',       label: 'Sofa Cleaning',       category: 'SVC' },
  { value: 'Interior Cleaning',   label: 'Interior Cleaning',   category: 'SVC' },
  { value: 'Deep Cleaning',       label: 'Deep Cleaning',       category: 'HOC' },
  { value: 'Shampoo Vacuum',      label: 'Shampoo Vacuum',      category: 'SVC' },
  { value: 'Vacuum Cleaning',     label: 'Vacuum Cleaning',     category: 'SVC' },
  { value: 'Mattress Cleaning',   label: 'Mattress Cleaning',   category: 'SVC' },
  { value: 'Carpet Cleaning',     label: 'Carpet Cleaning',     category: 'SVC' },
  { value: 'General Cleaning',    label: 'General Cleaning',    category: 'HOC' },
];

/** Returns the array of valid service type string values */
const getServiceTypeValues = () => SERVICE_TYPES.map(s => s.value);

/** Returns the array of valid service type category codes */
const getServiceTypeCategories = () => {
  const cats = [...new Set(SERVICE_TYPES.map(s => s.category))];
  return cats;
};

module.exports = {
  SERVICE_TYPES,
  getServiceTypeValues,
  getServiceTypeCategories,
};
