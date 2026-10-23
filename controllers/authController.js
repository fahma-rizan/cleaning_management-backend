const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const sendEmail = require('../utils/sendEmail');
const {
  isValidPassword, PASSWORD_RULE,
  isValidPhone, PHONE_RULE,
  isValidEmail, EMAIL_RULE,
  generateTempPassword,
} = require('../validators/authValidators');
const { normalizePhone, PASSWORD_REGEX } = require('../utils/validators');

// clientSecret + redirectUri are only used for the `code` exchange path below
// (accounts.oauth2.initCodeClient's popup fallback) — verifyIdToken (the
// `credential`/One Tap path) ignores them.
const googleClient = new OAuth2Client({
  clientId:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri:  'postmessage', // required by Google for the JS popup code flow — no real redirect happens
});

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
    const rawPhone = (req.body.phone || '').trim();

    if (!firstName || !lastName || !email || !rawPhone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: EMAIL_RULE });
    }
    // Accepts local (0771234567) or international (+94771234567) input and
    // stores the canonical +94 form either way — see normalizePhone.
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return res.status(400).json({ success: false, message: PHONE_RULE });
    }
    if (!isValidPassword(password)) {
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
      badge: 'Bronze',
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
        phone: user.phone,
        address: user.address,
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

// POST /api/auth/google
// Body: { credential } — the ID token Google Identity Services hands back to
// the frontend on sign-in. Verified server-side against GOOGLE_CLIENT_ID
// (google-auth-library), never trusted as-is. Stateless — no passport/session
// machinery, matching the rest of this API's plain-JWT design.
//
// Existing account with this email → signs them in (their normal role/flags
// apply). No account yet → creates a new customer, already verified (Google
// already proved the email), with a random password they'll never need
// (kept only because User.password is a required field; they always sign in
// via Google, and item 6's policy still applies since it's PASSWORD_REGEX-generated).
//
// Body is either { credential } — the ID token from the One Tap prompt — or
// { code } — an authorization code from the OAuth popup fallback the
// frontend uses when One Tap is suppressed by Chrome/Google's quiet-period
// cooldown (see lib/googleAuth.ts). A code is exchanged for its own ID token
// here, then verified exactly the same way as a directly-supplied credential.
const googleAuth = async (req, res) => {
  try {
    const { credential, code } = req.body;
    if (!credential && !code) {
      return res.status(400).json({ success: false, message: 'Missing Google credential.' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error('googleAuth error: GOOGLE_CLIENT_ID is not configured.');
      return res.status(500).json({ success: false, message: 'Google Sign-In is not configured.' });
    }

    let payload;
    try {
      let idToken = credential;
      if (!idToken && code) {
        const { tokens } = await googleClient.getToken(code);
        idToken = tokens.id_token;
      }
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('Google token verification failed:', verifyErr.message);
      return res.status(401).json({ success: false, message: 'Google sign-in verification failed.' });
    }

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ success: false, message: 'Google account email is not verified.' });
    }

    let user = await User.findOne({ email: payload.email.toLowerCase() });

    if (!user) {
      user = await User.create({
        firstName: payload.given_name || payload.name || 'Google',
        lastName:  payload.family_name || 'User',
        email:     payload.email.toLowerCase(),
        phone:     '',
        password:  generateTempPassword(), // never used to log in — Google is the only sign-in path
        role:      'customer',
        isVerified: true,
        loyaltyPoints: 0,
        badge: 'Bronze',
      });
    }

    // A staff/admin account created via the temp-password onboarding flow
    // could technically share an email with a Google login attempt — don't
    // let Google sign-in bypass their pending forced password change.
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        adminRole: user.adminRole,
        isVerified: user.isVerified,
        loyaltyPoints: user.loyaltyPoints,
        badge: user.badge,
        requiresPasswordChange: user.requiresPasswordChange,
      },
    });
  } catch (err) {
    console.error('googleAuth error:', err);
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
    // Reset fields only — skip full-document validation so legacy/staff
    // accounts missing firstName/lastName can still reset their password.
    await user.save({ validateBeforeSave: false });

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
    await user.save({ validateBeforeSave: false });

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

    if (!password || !PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.resetCodeVerified) return res.status(400).json({ success: false, message: 'Please verify your reset code first.' });

    user.password = password;
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    user.resetCodeVerified = false;
    await user.save({ validateBeforeSave: false });

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

    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
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
        adminRole: user.adminRole,
        requiresPasswordChange: false,
      },
    });
  } catch (err) {
    console.error('staffChangePassword error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// POST /api/auth/change-password (authenticated — protect middleware)
// Self-service password change from a logged-in session (e.g. Customer
// Dashboard > Settings > Security). Different from staffChangePassword above:
// this one identifies the user from the JWT (req.user), not from an email
// field in the body, and doesn't touch requiresPasswordChange.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_RULE });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from your current password.' });
    }

    user.password = newPassword;
    user.requiresPasswordChange = false;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// PUT /api/auth/profile — self-service "My Profile" edit (name/phone/address).
// req.user comes from the `protect` middleware. Deliberately does NOT accept
// email changes here — that would need re-verification (isVerified/OTP) to
// avoid silently repointing the account to an unproven address; out of
// scope for this endpoint.
const updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    if (name !== undefined) {
      const trimmed = String(name).trim().replace(/\s+/g, ' ');
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
      }
      const spaceIdx = trimmed.indexOf(' ');
      user.firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      user.lastName  = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
    }

    if (phone !== undefined) {
      if (phone && !isValidPhone(phone)) {
        return res.status(400).json({ success: false, message: PHONE_RULE });
      }
      user.phone = phone;
    }

    if (address !== undefined) {
      user.address = address;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        adminRole: user.adminRole,
        isVerified: user.isVerified,
        loyaltyPoints: user.loyaltyPoints,
        badge: user.badge,
        requiresPasswordChange: user.requiresPasswordChange,
      },
    });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// DELETE /api/auth/account — customer self-service "Delete Account".
// req.user is already established by the `protect` middleware, so this
// doesn't ask for a password (Google-only sign-ins never set one they'd
// know) — the frontend instead requires typing "DELETE" to confirm.
//
// Rather than a hard delete — which would orphan every Booking/Payment/
// Review/Complaint/LoyaltyTransaction referencing this customer and break
// admin reports/financial records that expect those to exist — this
// anonymizes personal info and deactivates the account, keeping booking/
// payment history intact for business records and audit trail.
const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    if (user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customer accounts can be deleted here.' });
    }

    user.firstName    = 'Deleted';
    user.lastName     = 'User';
    // Free up the original email for reuse (unique index) — nobody can type
    // this placeholder to log back in.
    user.email         = `deleted-${user._id}@deleted.cloudlaundry.lk`;
    user.phone         = '';
    user.address       = '';
    user.profilePhoto  = undefined;
    user.status        = 'blocked';
    user.isActive       = false; // also kills any still-valid JWT immediately — see protect() in authMiddleware.js
    user.deletedAt      = new Date();
    // Clear any in-flight OTP/reset flows against the old identity.
    user.otp                = undefined;
    user.otpExpiry          = undefined;
    user.resetCode          = undefined;
    user.resetCodeExpiry    = undefined;
    user.resetCodeVerified  = false;

    await user.save();

    res.json({ success: true, message: 'Your account has been deleted.' });
  } catch (err) {
    console.error('deleteAccount error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

module.exports = {
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
  changePassword,
  updateProfile,
  deleteAccount,
};
