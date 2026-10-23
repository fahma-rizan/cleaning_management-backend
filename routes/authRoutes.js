const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  googleAuth,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  changePassword,
  staffChangePassword,
  updateProfile,
  deleteAccount,
} = require('../controllers/authController');

router.post('/register',                register);
router.post('/verify-otp',              verifyOTP);
router.post('/resend-otp',              resendOTP);
router.post('/login',                   login);
router.post('/google',                  googleAuth);
router.post('/forgot-password',         forgotPassword);
router.post('/verify-reset-code',       verifyResetCode);
router.post('/reset-password',          resetPassword);
router.post('/staff-change-password',   staffChangePassword);
// Authenticated "change my own password" — customer/staff/admin Security
// settings. Distinct from staff-change-password (pre-login, temp-password-only).
router.post('/change-password',         protect, changePassword);
// Self-service "My Profile" edit — name/phone/address only, see authController.updateProfile.
router.put('/profile',                  protect, updateProfile);
// Customer self-service "Delete Account" — see authController.deleteAccount
// for why this anonymizes rather than hard-deletes.
router.delete('/account',               protect, deleteAccount);

module.exports = router;
