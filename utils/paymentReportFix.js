/**
 * Patch: Fix paymentReportController.js date logic + add service type filter
 * A.6 Payment Report Export fixes:
 * 1. Service type filter uses shared constants (single source of truth)
 * 2. Date range: fromDate inclusive (>= startOf), toDate inclusive of entire day (<= endOf)
 */
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'controllers', 'paymentReportController.js');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('getServiceTypeValues')) {
  console.log('Already patched');
  process.exit(0);
}

// Add require at top
content = content.replace(
  "const mongoose = require('mongoose');",
  "const mongoose = require('mongoose');\nconst { getServiceTypeValues } = require('../utils/serviceTypes');"
);

// Fix getPaymentReports date logic + add serviceType filter
content = content.replace(
  /const getPaymentReports = async \(req, res\) => \{\n  try \{\n    const \{ startDate, endDate, status, method, page = 1, limit = 10 \} = req\.query;\n\n    const matchStage = \{\n      createdAt: \{\n        \$gte: new Date\(startDate\),\n        \$lte: new Date\(endDate\),\n      \},\n    \};\n\n    if \(status\) matchStage\.status = status;\n    if \(method\) matchStage\.method = method;/,
  `const getPaymentReports = async (req, res) => {
  try {
    const { fromDate, toDate, serviceType, status, method, page = 1, limit = 10 } = req.query;

    const matchStage = {
      createdAt: {},
    };

    // A.6 Fix 2: Correct date range logic
    // fromDate inclusive (>= startOf day), toDate inclusive of entire day (<= endOf day 23:59:59)
    if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + 'T00:00:00');
    if (toDate)   matchStage.createdAt.$lte = new Date(toDate + 'T23:59:59');

    // A.6 Fix 1: Service type filter from shared constants
    const validServiceTypes = getServiceTypeValues();
    if (serviceType) {
      if (validServiceTypes.includes(serviceType)) {
        matchStage.serviceType = serviceType;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid service type filter.',
        });
      }
    }

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;`
);

// Fix exportPaymentReportCSV date logic + add serviceType filter
content = content.replace(
  /const exportPaymentReportCSV = async \(req, res\) => \{\n  try \{\n    const \{ startDate, endDate, status, method \} = req\.query;\n\n    const matchStage = \{\n      createdAt: \{\n        \$gte: new Date\(startDate\),\n        \$lte: new Date\(endDate\),\n      \},\n    \};\n\n    if \(status\) matchStage\.status = status;\n    if \(method\) matchStage\.method = method;/,
  `const exportPaymentReportCSV = async (req, res) => {
  try {
    const { fromDate, toDate, serviceType, status, method } = req.query;

    const matchStage = {
      createdAt: {},
    };

    // A.6 Fix 2: Correct date range — inclusive of fromDate start, toDate entire day
    if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + 'T00:00:00');
    if (toDate)   matchStage.createdAt.$lte = new Date(toDate + 'T23:59:59');

    const validServiceTypes = getServiceTypeValues();
    if (serviceType) {
      if (validServiceTypes.includes(serviceType)) {
        matchStage.serviceType = serviceType;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid service type filter.' });
      }
    }

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;`
);

// Fix exportPaymentReportPDF date logic
content = content.replace(
  /const matchStage = \{\n      createdAt: \{\n        \$gte: new Date\(startDate\),\n        \$lte: new Date\(endDate\),\n      \},\n    \};\n\n    if \(status\) matchStage\.status = status;\n    if \(method\) matchStage\.method = method;/g,
  `const matchStage = {
      createdAt: {},
    };

    if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + 'T00:00:00');
    if (toDate)   matchStage.createdAt.$lte = new Date(toDate + 'T23:59:59');

    if (status) matchStage.status = status;
    if (method) matchStage.method = method;`
);

// Also fix the PDF query parameters
content = content.replace(
  "const { startDate, endDate, status, method } = req.query;\n\n    const matchStage = {\n      createdAt: {\n        $gte: new Date(startDate),\n        $lte: new Date(endDate),\n      },\n    };\n\n    if (status) matchStage.status = status;\n    if (method) matchStage.method = method;",
  "const { fromDate, toDate, status, method } = req.query;\n\n    const matchStage = {\n      createdAt: {},\n    };\n\n    if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + 'T00:00:00');\n    if (toDate)   matchStage.createdAt.$lte = new Date(toDate + 'T23:59:59');\n\n    if (status) matchStage.status = status;\n    if (method) matchStage.method = method;"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Payment report controller patched');
