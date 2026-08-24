const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const {
  getAllAdmins, getAdminById, createAdmin,
  updateAdmin, deactivateAdmin, activateAdmin, deleteAdmin,
} = require('../controllers/adminController');

// Mirrors routes/staffRoutes.js's upload config. Required even though we
// only care about the text fields on some requests — without multer here,
// Express never parses a multipart/form-data body at all (req.body comes
// through empty), and the frontend's adminAPI.create/update always send
// FormData (photo included), so Add/Edit Admin silently received nothing.
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'admin'),
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
