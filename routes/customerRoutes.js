const express = require('express');
const router  = express.Router();
const {
  getAllCustomers,
  getCustomerById,
  updateCustomerStatus,
} = require('../controllers/customerController');

router.get('/',              getAllCustomers);
router.get('/:id',           getCustomerById);
router.put('/:id/status',    updateCustomerStatus);

module.exports = router;
