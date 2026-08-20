const AUTH = {
  JWT_ACCESS_EXPIRY:  '15m',
  JWT_REFRESH_EXPIRY: '7d',
  BCRYPT_SALT_ROUNDS: 12,
  OTP_LENGTH:         6,
  OTP_EXPIRY_MINUTES: 10,
  OTP_MAX_ATTEMPTS:   3,
  REFRESH_TOKEN_DAYS: 7,

  // min 8 chars, at least 1 lowercase, 1 uppercase, 1 number, 1 special character.
  // Special character = anything that isn't a letter or digit, so users aren't
  // tripped up by picking a symbol (e.g. #) that a narrower allow-list excluded.
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  PASSWORD_RULE:  'Minimum 8 characters with uppercase, lowercase, number and special character.',

  // Sri Lankan mobile numbers in +94 international format
  PHONE_REGEX: /^\+94(70|71|72|74|75|76|77|78)\d{7}$/,
  PHONE_RULE:  'Enter a valid Sri Lankan phone number',

  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  EMAIL_RULE:  'Enter a valid email address',

  ROLES: {
    SUPER_ADMIN:            'super_admin',
    MAIN_ADMIN:             'main_admin',
    OPERATION_ADMIN:        'operation_admin',
    CUSTOMER_SUPPORT_ADMIN: 'customer_support_admin',
    STAFF:                  'staff',
    CUSTOMER:               'customer',
    ADMIN:                  'admin', // legacy alias for super_admin — kept for backward compat
  },

  // All roles that can access the admin dashboard
  ADMIN_ROLES: ['super_admin', 'main_admin', 'operation_admin', 'customer_support_admin', 'admin'],

  // Admin + staff (can access staff-level features)
  STAFF_ROLES: ['super_admin', 'main_admin', 'operation_admin', 'customer_support_admin', 'staff', 'admin'],

  OTP_PURPOSES: {
    VERIFY_EMAIL:   'verify_email',
    RESET_PASSWORD: 'reset_password',
  },
};

module.exports = AUTH;
