const jwt = require('jsonwebtoken');

// FIX: Fail fast at startup if JWT_SECRET is not set.
// Previously there was a hardcoded fallback string — anyone who read the source
// code could forge valid tokens for any user. Now the server refuses to start
// without the secret, making the misconfiguration impossible to miss.
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
}

const auth = (req, res, next) => {
  // Get token from the 'Authorization' header in the format "Bearer <token>"
  const authHeader = req.header('Authorization');

  // If no Authorization header is present, allow a development bypass so
  // local demos and presentations don't fail with 401. In production this
  // remains strict and will return 401.
  if (!authHeader) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('DEV: No Authorization header supplied — applying development bypass.');
      req.user = {
        id: process.env.DEV_USER_ID || 'admin-001',
        email: process.env.DEV_USER_EMAIL || 'admin@cloudlaundry.lk',
        role: 'admin',
      };
      return next();
    }
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token is malformed, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    // In development, allow a dev-bypass so the local demo token can be used
    // without having to issue a real JWT. This keeps local dev fast while
    // still enforcing token presence in production.
    if (process.env.NODE_ENV === 'development') {
      console.warn('DEV: token verification failed — applying development bypass.');
      // Provide a default demo user; components expect `id` and `role` at minimum.
      req.user = {
        id: process.env.DEV_USER_ID || 'admin-001',
        email: process.env.DEV_USER_EMAIL || 'admin@cloudlaundry.lk',
        role: 'admin',
      };
      return next();
    }

    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;