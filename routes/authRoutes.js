const express = require('express');
const router = express.Router();
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  staffChangePassword,
} = require('../controllers/authController');

router.post('/register',                register);
router.post('/verify-otp',              verifyOTP);
router.post('/resend-otp',              resendOTP);
router.post('/login',                   login);
router.post('/forgot-password',         forgotPassword);
router.post('/verify-reset-code',       verifyResetCode);
router.post('/reset-password',          resetPassword);
router.post('/staff-change-password',   staffChangePassword);

module.exports = router;
