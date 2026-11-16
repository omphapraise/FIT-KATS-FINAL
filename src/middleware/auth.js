const jwt = require('jsonwebtoken');
const db = require('../db');

// Reads role, is_active and verification_status from the database on EVERY request.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Please log in first' });
  }

  let user;
  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const payload = jwt.verify(token, secret);
    user = db
      .prepare('SELECT id, role, is_active, verification_status FROM Users WHERE id = ?')
      .get(payload.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account no longer exists' });
    }
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again' });
  }

  if (user.is_active !== 1) {
    return res.status(401).json({ success: false, message: 'This account has been deactivated' });
  }

  req.userId = user.id;
  req.userRole = user.role;
  req.verificationStatus = user.verification_status;
  next();
}

// Use AFTER requireAuth: router.get('/x', requireAuth, requireRole('staff', 'manager'), handler)
function requireRole(...roles) {
  return function (req, res, next) {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to do that' });
    }
    next();
  };
}

// The default export stays a function (other routes rely on that).
module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
