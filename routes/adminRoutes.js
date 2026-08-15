const express = require('express');
const router  = express.Router();
const {
  getAllAdmins, getAdminById, createAdmin,
  updateAdmin, deactivateAdmin, activateAdmin, deleteAdmin,
} = require('../controllers/adminController');

router.get('/',               getAllAdmins);
router.get('/:id',            getAdminById);
router.post('/',              createAdmin);
router.put('/:id',            updateAdmin);
router.put('/:id/deactivate', deactivateAdmin);
router.put('/:id/activate',   activateAdmin);
router.delete('/:id',         deleteAdmin);

module.exports = router;
