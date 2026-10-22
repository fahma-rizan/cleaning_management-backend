const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getItems, getItem, createItem, updateItem, deleteItem, adjustStock, getLowStock, getItemTransactions,
} = require('../controllers/inventoryController');

// Admin Inventory Management — every route here is admin-only.
// Literal paths before '/:id' wildcard
router.get('/low-stock',        protect, adminOnly, getLowStock);
router.get('/',                 protect, adminOnly, getItems);
router.post('/',                protect, adminOnly, createItem);
router.get('/:id',              protect, adminOnly, getItem);
router.put('/:id',              protect, adminOnly, updateItem);
router.delete('/:id',           protect, adminOnly, deleteItem);
router.post('/:id/adjust',      protect, adminOnly, adjustStock);
router.get('/:id/transactions', protect, adminOnly, getItemTransactions);

module.exports = router;
