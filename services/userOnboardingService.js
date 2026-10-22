// Shared account-creation logic for both Staff Management and Admin
// Management — one function, reused by both, instead of duplicating the
// temp-password/email/requiresPasswordChange logic in two controllers.
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { generateTempPassword } = require('../validators/authValidators');

const onboardingEmailHTML = (name, email, tempPassword, portalLabel) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f5f3ff;border-radius:12px;">
    <h2 style="color:#7C3AED;text-align:center;margin-bottom:4px;">☁️ Cloud Laundry</h2>
    <h3 style="color:#111827;text-align:center;">Welcome to the ${portalLabel} Portal</h3>
    <p style="color:#374151;">Hi <strong>${name}</strong>, an account has been created for you. Here are your login details:</p>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;color:#374151;"><strong>Email:</strong> ${email}</p>
      <p style="margin:4px 0;color:#374151;"><strong>Temporary Password:</strong>
        <span style="font-family:monospace;background:#F5F3FF;color:#7C3AED;padding:2px 8px;border-radius:6px;">${tempPassword}</span>
      </p>
    </div>
    <p style="color:#6B7280;font-size:13px;">
      For security, you'll be required to set your own password the first time you log in.
      Do not share this temporary password with anyone.
    </p>
  </div>
`;

// Creates a User with a securely random, policy-compliant temp password
// (never accepted from the request — always generated server-side), emails
// it to them, and flags the account so the first login forces a real
// password to be set before anything else is accessible.
//
// `fields` — everything role-specific (name split, role, adminRole,
// specializations, etc.) except password/requiresPasswordChange, which this
// function owns. Returns the created User document.
async function createOnboardedUser(fields, { portalLabel }) {
  const tempPassword = generateTempPassword();

  const user = await User.create({
    ...fields,
    password: tempPassword, // hashed by the User model's pre-save hook
    isVerified: true,       // admin-created accounts don't go through OTP email verification
    requiresPasswordChange: true,
  });

  const emailed = await sendEmail({
    to: user.email,
    subject: `Cloud Laundry – Your ${portalLabel} Account`,
    html: onboardingEmailHTML(user.name, user.email, tempPassword, portalLabel),
  });
  if (!emailed) {
    // Account creation must not silently fail just because the email
    // provider hiccupped — log it loudly so an admin can hand the temp
    // password over manually instead.
    console.error(`⚠️ Onboarding email failed to send for ${user.email} — temp password: ${tempPassword}`);
  }

  return user;
}

module.exports = { createOnboardedUser };
