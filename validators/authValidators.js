// Shared, backend-authoritative validation for anything that sets a password,
// email, or Sri Lankan phone number — registration, forgot/reset password,
// change password (self-service and first-login), staff/admin creation.
// Frontend copies of these rules are for UX only; this is the source of truth.
const crypto = require('crypto');

// ─── Password ───────────────────────────────────────────────────────────────
// min 8 chars, at least 1 lowercase, 1 uppercase, 1 number, 1 special char.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULE  = 'Minimum 8 characters with uppercase, lowercase, number and special character.';
const isValidPassword = (password) => typeof password === 'string' && PASSWORD_REGEX.test(password);

// ─── Phone (Sri Lankan mobile) ──────────────────────────────────────────────
// Accepts local (0771234567) and international (+94771234567 / 94771234567)
// forms of the same number, across the real SL mobile prefixes.
const PHONE_REGEX = /^(?:\+94|94|0)(70|71|72|74|75|76|77|78)\d{7}$/;
const PHONE_RULE  = 'Enter a valid Sri Lankan mobile number (e.g. 0771234567 or +94771234567).';
// Strips internal whitespace too, not just leading/trailing — some frontend
// forms send a pretty-printed phone (e.g. "077 123 4567" from normalizePhoneNumber).
const isValidPhone = (phone) => typeof phone === 'string' && PHONE_REGEX.test(phone.replace(/\s+/g, ''));

// ─── Email ──────────────────────────────────────────────────────────────────
// Same practical standard used by the frontend forms already — a fully
// RFC-5322-compliant regex is famously impractical and not worth the
// complexity here.
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const EMAIL_RULE  = 'Enter a valid email address.';
const isValidEmail = (email) => typeof email === 'string' && EMAIL_REGEX.test(email.trim());

// ─── Secure random temp password (staff/admin onboarding) ──────────────────
// Guaranteed to satisfy PASSWORD_REGEX: one fixed char from each required
// class, then random from a combined pool, shuffled so the fixed characters
// aren't always in the same position.
const generateTempPassword = () => {
  const lower   = 'abcdefghijkmnpqrstuvwxyz';       // no l/o — avoid look-alikes
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';        // no I/O
  const digits  = '23456789';                        // no 0/1
  const special = '!@#$%^&*';
  const all = lower + upper + digits + special;

  const pick = (pool) => pool[crypto.randomInt(pool.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  for (let i = chars.length; i < 12; i++) chars.push(pick(all));

  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

module.exports = {
  PASSWORD_REGEX, PASSWORD_RULE, isValidPassword,
  PHONE_REGEX, PHONE_RULE, isValidPhone,
  EMAIL_REGEX, EMAIL_RULE, isValidEmail,
  generateTempPassword,
};
