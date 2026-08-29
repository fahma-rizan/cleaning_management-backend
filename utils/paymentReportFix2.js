/**
 * Patch 2: Fix paymentReportController.js date logic + service type filter
 * Uses line-by-line replacement for reliability.
 */
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'controllers', 'paymentReportController.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Add the require for serviceTypes at the top (if not already there)
if (!lines.some(l => l.includes("require('../utils/serviceTypes')"))) {
  lines.unshift("const { getServiceTypeValues } = require('../utils/serviceTypes');");
}

let inGetPaymentReports = false;
let inExportCSV = false;
let inExportPDF = false;

for (let i = 0; i < lines.length; i++) {
  // Detect which function we're in
  if (lines[i].includes('const getPaymentReports = async')) inGetPaymentReports = true;
  if (lines[i].includes('const exportPaymentReportCSV = async')) inExportCSV = true;
  if (lines[i].includes('const exportPaymentReportPDF = async')) inExportPDF = true;
  if (lines[i].includes('const getReconciliationReport = async')) {
    inGetPaymentReports = false;
    inExportCSV = false;
    inExportPDF = false;
  }

  // Fix date parameter names and logic
  if (inGetPaymentReports && lines[i].includes('const { startDate, endDate, status, method, page = 1, limit = 10 }')) {
    lines[i] = '    const { fromDate, toDate, serviceType, status, method, page = 1, limit = 10 } = req.query;';
  }
  if (inExportCSV && lines[i].includes('const { startDate, endDate, status, method }')) {
    lines[i] = '    const { fromDate, toDate, serviceType, status, method } = req.query;';
  }
  if (inExportPDF && lines[i].includes('const { startDate, endDate, status, method }')) {
    lines[i] = '    const { fromDate, toDate, status, method } = req.query;';
  }

  // Fix date range logic — the pattern `createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }`
  if (lines[i].includes('$gte: new Date(startDate)')) {
    lines[i] = '      createdAt: {';
    // Replace $lte line
    if (lines[i+1] && lines[i+1].includes('$lte: new Date(endDate)')) {
      lines[i+1] = '      };';
    }
    // Insert new date logic after
    if (lines[i+2] && lines[i+2].includes('};')) {
      lines[i+2] = '      if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + \'T00:00:00\');';
      // Insert the toDate line
      lines.splice(i+3, 0, '      if (toDate)   matchStage.createdAt.$lte = new Date(toDate + \'T23:59:59\');');
      i += 3; // skip ahead
    }
  } else if (lines[i].includes('$lte: new Date(endDate)')) {
    // Handle case where $lte is on a separate line from $gte
    if (lines[i+1] && lines[i+1].includes('};')) {
      lines[i] = '      if (toDate)   matchStage.createdAt.$lte = new Date(toDate + \'T23:59:59\');';
      lines[i+1] = '      if (fromDate) matchStage.createdAt.$gte = new Date(fromDate + \'T00:00:00\');';
      // Insert empty line and closing
      lines.splice(i+2, 0, '      };');
      i += 2;
    }
  }

  // Fix the matchStage object structure for getPaymentReports
  if (inGetPaymentReports && lines[i].includes('const matchStage = {') && lines[i+1] && lines[i+1].includes('createdAt: {')) {
    // Already handled above
  }
}

// Second pass: add serviceType filter to getPaymentReports
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (status) matchStage.status = status;') && i > 0 && lines[i-1] && lines[i-1].includes('matchStage.method = method')) {
    // Insert serviceType check before status check
    lines.splice(i, 0,
      '    const validServiceTypes = getServiceTypeValues();',
      '    if (serviceType) {',
      '      if (validServiceTypes.includes(serviceType)) {',
      '        matchStage.serviceType = serviceType;',
      '      } else {',
      '        return res.status(400).json({ success: false, message: \'Invalid service type filter.\' });',
      '      }',
      '    }',
      ''
    );
    i += 8; // skip inserted lines
  }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Payment report controller patched (fix2)');
