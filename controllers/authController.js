const User = require('../models/User');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');

// ─── Validation rules (ported from feature/auth-loyalty-inventory-backend) ────
// Sri Lankan mobile numbers in +94 international format.
const PHONE_REGEX = /^\+94(70|71|72|74|75|76|77|78)\d{7}$/;
const PHONE_RULE  = 'Enter a valid Sri Lankan phone number (e.g. +94771234567).';
// min 8 chars, at least 1 lowercase, 1 uppercase, 1 number, 1 special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULE  = 'Minimum 8 characters with uppercase, lowercase, number and special character.';

// ─── Helpers ────────────────────────────────────────────────────────────────

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const otpEmailHTML = (name, otp, action = 'Verify Your Email') => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f5f3ff;border-radius:12px;">
    <h2 style="color:#7C3AED;text-align:center;margin-bottom:4px;">☁️ Cloud Laundry</h2>
    <h3 style="color:#111827;text-align:center;">${action}</h3>
    ${name ? `<p style="color:#374151;">Hi <strong>${name}</strong>, your code is:</p>` : '<p style="color:#374151;">Your code is:</p>'}
    <div style="background:#7C3AED;color:#fff;font-size:36px;font-weight:bold;text-align:center;padding:24px;border-radius:10px;letter-spacing:10px;margin:16px 0;">
      ${otp}
    </div>
    <p style="color:#6B7280;font-size:13px;">This code expires in 10 minutes. Do not share it with anyone.</p>
  </div>
`;

// ─── Controllers ────────────────────────────────────────────────────────────

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { firstName, lastName, password } = req.body;
    // FIX: trim email/phone before validating or saving — otherwise stray
    // whitespace (autofill, copy-paste) makes a genuinely valid value fail
    // its regex, or fail to match an existing record on duplicate-check.
    const email = (req.body.email || '').trim();
    const phone = (req.body.phone || '').trim();

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!PHONE_REGEX.test(phone)) {
      return res.status(400).json({ success: false, message: PHONE_RULE });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
    }

    const [existing, existingPhone] = await Promise.all([
      User.findOne({ email: email.toLowerCase() }),
      User.findOne({ phone }),
    ]);

    if (existing) {
      if (existing.isVerified) {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered. Please Sign In.',
        });
      }
      // Not verified yet — resend OTP. Only block if the phone actually
      // changed to one already claimed by a genuinely different account —
      // resubmitting the same phone this account already has must never
      // block just because the lookup happens to resolve to another
      // unverified duplicate sharing that number.
      if (phone !== existing.phone && existingPhone && String(existingPhone._id) !== String(existing._id)) {
        return res.status(400).json({ success: false, message: 'Phone number already registered.' });
      }
      const otp = generateOTP();
      existing.firstName = firstName;
      existing.lastName  = lastName;
      existing.phone     = phone;
      existing.password  = password; // pre-save hook re-hashes since this marks the path modified
      existing.otp = otp;
      existing.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await existing.save();

      console.log(`\n📌 OTP for ${email}: ${otp}\n`);
      await sendEmail({ to: email, subject: 'Cloud Laundry – Verify Your Email', html: otpEmailHTML(firstName, otp) });
      return res.json({ success: true, message: 'OTP sent to your email address.' });
    }

    if (existingPhone && existingPhone.isVerified) {
      return res.status(400).json({ success: false, message: 'Phone number already registered.' });
    }

    const otp = generateOTP();

    await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      role: 'customer',
      isVerified: false,
      otp,
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      loyaltyPoints: 0,
      badge: 'Silver',
    });

    console.log(`\n📌 OTP for ${email}: ${otp}\n`);
    await sendEmail({ to: email, subject: 'Cloud Laundry – Verify Your Email', html: otpEmailHTML(firstName, otp) });

    res.status(201).json({ success: true, message: 'Registration successful. OTP sent to your email.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/verify-otp
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Email already verified.' });
    if (user.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid code. Please try again.' });
    if (user.otpExpiry < new Date()) return res.status(400).json({ success: false, message: 'Code has expired. Please request a new one.' });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        loyaltyPoints: user.loyaltyPoints,
        badge: user.badge,
      },
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/resend-otp
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Email already verified.' });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    console.log(`\n📌 Resend OTP for ${email}: ${otp}\n`);
    await sendEmail({ to: email, subject: 'Cloud Laundry – New Verification Code', html: otpEmailHTML(user.firstName, otp) });

    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password. Please try again.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect email or password. Please try again.' });
    }

    // Customers must verify email before login
    if (!user.isVerified && user.role === 'customer') {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email first.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        adminRole: user.adminRole,
        isVerified: user.isVerified,
        loyaltyPoints: user.loyaltyPoints,
        badge: user.badge,
        requiresPasswordChange: user.requiresPasswordChange,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Email not found or password reset is not available for this account type.',
      });
    }

    const resetCode = generateOTP();
    user.resetCode = resetCode;
    user.resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
    user.resetCodeVerified = false;
    await user.save();

    console.log(`\n📌 Reset code for ${email}: ${resetCode}\n`);
    await sendEmail({
      to: email,
      subject: 'Cloud Laundry – Password Reset Code',
      html: otpEmailHTML(user.firstName, resetCode, 'Password Reset Code'),
    });

    res.json({ success: true, message: 'Reset code sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/verify-reset-code
const verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.resetCode !== code) return res.status(400).json({ success: false, message: 'Invalid code. Please try again.' });
    if (user.resetCodeExpiry < new Date()) return res.status(400).json({ success: false, message: 'Code has expired. Please request a new one.' });

    user.resetCodeVerified = true;
    await user.save();

    res.json({ success: true, message: 'Code verified successfully.' });
  } catch (err) {
    console.error('Verify reset code error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.resetCodeVerified) return res.status(400).json({ success: false, message: 'Please verify your reset code first.' });

    user.password = password;
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    user.resetCodeVerified = false;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/staff-change-password
// Called from StaffFirstLogin page on first login
const staffChangePassword = async (req, res) => {
  try {
    const { email, tempPassword, newPassword } = req.body;

    if (!email || !tempPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    const isMatch = await user.comparePassword(tempPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Temporary password is incorrect.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    user.password = newPassword;
    user.requiresPasswordChange = false;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Password changed successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        requiresPasswordChange: false,
      },
    });
  } catch (err) {
    console.error('staffChangePassword error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  staffChangePassword,
};
