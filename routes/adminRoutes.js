const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const {
  getAllAdmins, getAdminById, createAdmin,
  updateAdmin, deactivateAdmin, activateAdmin, deleteAdmin,
} = require('../controllers/adminController');

// create/update send multipart/form-data (a photo field is included, even
// though it isn't stored/used yet) — without this, req.body was silently
// empty on both routes since Express's json() middleware doesn't parse
// multipart bodies. Mirrors staffRoutes.js's exact multer setup.
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'staff'),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
    },
  }),
});

router.get('/',               getAllAdmins);
router.get('/:id',            getAdminById);
router.post('/',              upload.single('photo'), createAdmin);
router.put('/:id',            upload.single('photo'), updateAdmin);
router.put('/:id/deactivate', deactivateAdmin);
router.put('/:id/activate',   activateAdmin);
router.delete('/:id',         deleteAdmin);

module.exports = router;
