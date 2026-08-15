const express = require('express');
const router  = express.Router();
const {
  getItems, getItem, createItem, updateItem, deleteItem, adjustStock, getLowStock, getItemTransactions,
} = require('../controllers/inventoryController');

// Literal paths before '/:id' wildcard
router.get('/low-stock',        getLowStock);
router.get('/',                 getItems);
router.post('/',                createItem);
router.get('/:id',              getItem);
router.put('/:id',              updateItem);
router.delete('/:id',           deleteItem);
router.post('/:id/adjust',      adjustStock);
router.get('/:id/transactions', getItemTransactions);

module.exports = router;
