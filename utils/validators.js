// Shared validation rules + helpers for anything touching auth credentials
// (register, reset-password, change-password, admin-created staff/admin
// accounts). Centralised here so every entry point enforces the same rule
// instead of each controller re-typing (and inevitably drifting from) its
// own regex.

// Sri Lankan mobile numbers, canonical stored form: +94771234567 (no spaces).
const PHONE_REGEX = /^\+94(70|71|72|74|75|76|77|78)\d{7}$/;
const PHONE_RULE  = 'Enter a valid Sri Lankan phone number (e.g. 0771234567).';

// The frontend accepts (and sometimes re-formats with spaces) local
// "0771234567", "+94 77 123 4567", or "94771234567" — this turns any of
// those into the canonical "+94771234567" form before it's validated or
// stored, so the DB never ends up with three different formats for the
// same number. Returns null if the result still isn't a valid SL mobile.
const normalizePhone = (raw) => {
  const compact = (raw || '').trim().replace(/[\s()-]/g, '');
  let candidate = compact;
  if (compact.startsWith('+94')) candidate = compact;
  else if (compact.startsWith('94'))  candidate = `+${compact}`;
  else if (compact.startsWith('0'))   candidate = `+94${compact.slice(1)}`;
  else return null;

  return PHONE_REGEX.test(candidate) ? candidate : null;
};

// Basic but real email shape check — not exhaustive RFC 5322, just enough to
// reject obviously-malformed input before it reaches the DB.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_RULE  = 'Enter a valid email address.';

// Min 8 chars, at least 1 lowercase, 1 uppercase, 1 number, 1 special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULE  = 'Minimum 8 characters with uppercase, lowercase, number and special character.';

const SPECIAL_CHARS = '!@#$%^&*()-_=+?';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no O/I — avoids visual confusion with 0/1
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';                  // no 0/1 — same reason

const randomChar = (chars) => chars[Math.floor(Math.random() * chars.length)];

// Generates a random password that always satisfies PASSWORD_REGEX — used
// for auto-generated Staff/Admin credentials so nobody has to hand-type
// (or reuse the same hardcoded) one.
const generateStrongPassword = (length = 12) => {
  const required = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGITS), randomChar(SPECIAL_CHARS)];
  const all = UPPER + LOWER + DIGITS + SPECIAL_CHARS;
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(all));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the guaranteed classes aren't always in the same
  // first-4 positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

// Shared "here are your account credentials" email body — used for both
// newly-created Staff and Admin accounts.
const credentialsEmailHTML = (name, email, tempPassword, roleLabel = 'account') => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f5f3ff;border-radius:12px;">
    <h2 style="color:#7C3AED;text-align:center;margin-bottom:4px;">☁️ Cloud Laundry</h2>
    <h3 style="color:#111827;text-align:center;">Your ${roleLabel} has been created</h3>
    <p style="color:#374151;">Hi <strong>${name}</strong>, an account has been set up for you. Use these credentials to log in:</p>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px 20px;margin:16px 0;">
      <p style="margin:4px 0;color:#374151;"><strong>Email:</strong> ${email}</p>
      <p style="margin:4px 0;color:#374151;"><strong>Temporary password:</strong>
        <span style="font-family:monospace;background:#F5F3FF;color:#7C3AED;padding:2px 8px;border-radius:6px;">${tempPassword}</span>
      </p>
    </div>
    <p style="color:#6B7280;font-size:13px;">You'll be asked to set your own password the first time you log in. Do not share this temporary password with anyone.</p>
  </div>
`;

module.exports = {
  PHONE_REGEX, PHONE_RULE, normalizePhone,
  EMAIL_REGEX, EMAIL_RULE,
  PASSWORD_REGEX, PASSWORD_RULE,
  generateStrongPassword,
  credentialsEmailHTML,
};
