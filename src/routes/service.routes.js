const express = require('express');
const { protect, authorise } = require('../middleware/auth.middleware');
const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} = require('../controllers/service.controller');

const router = express.Router();

// Public routes
router.get('/', getAllServices);
router.get('/:id', getServiceById);

// Admin-only routes
router.post('/', protect, authorise('admin'), createService);
router.put('/:id', protect, authorise('admin'), updateService);
router.delete('/:id', protect, authorise('admin'), deleteService);

module.exports = router;
