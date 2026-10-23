const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleGuard');
const {
  getAllCustomers,
  getCustomerById,
  getDetails,
  updateCustomerStatus,
} = require('../controllers/customerController');

const ALLOWED = ['Super Admin', 'Main Admin', 'Customer Support'];

router.get('/',              protect, requireRole(...ALLOWED), getAllCustomers);
router.get('/:id',           protect, requireRole(...ALLOWED), getCustomerById);
router.get('/:id/details',   protect, requireRole(...ALLOWED), getDetails);
router.put('/:id/status',    protect, requireRole(...ALLOWED), updateCustomerStatus);

module.exports = router;