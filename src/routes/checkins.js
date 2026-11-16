const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const core = require('../checkinCore');

const router = express.Router();

const TOKEN_TTL_SECONDS = 60;      // how long a QR token lives
const REFRESH_AFTER_SECONDS = 50;  // app should fetch a new one after this
const BUSY_WINDOW_MINUTES = 60;    // "how busy" = check-ins in this window

// Derived secret: a check-in token can never be used as a login token (and vice versa),
// because requireAuth verifies with the plain JWT secret.
function checkinSecret() {
  return (process.env.JWT_SECRET || 'dev_secret') + ':checkin';
}

// 'ok' | 'bad' | 'not_configured'
function kioskKeyCheck(req) {
  const expected = process.env.KIOSK_KEY || '';
  if (expected.length < 16) return 'not_configured';
  const given = Buffer.from(String(req.headers['x-kiosk-key'] || ''));
  const want = Buffer.from(expected);
  if (given.length !== want.length) return 'bad';
  return crypto.timingSafeEqual(given, want) ? 'ok' : 'bad';
}

// GET /checkin-token  (member, JWT) -> short-lived token to put in the QR code
router.get('/checkin-token', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, membership_expiry, is_active, verification_status FROM Users WHERE id = ?')
    .get(req.userId);
  const problem = user ? core.eligibilityProblem(user) : 'Member not found';
  if (problem) {
    return res.status(403).json({ success: false, message: problem });
  }

  const token = jwt.sign({ id: req.userId, type: 'checkin' }, checkinSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  res.json({
    success: true,
    message: 'Check-in token created',
    data: {
      token,
      expires_in: TOKEN_TTL_SECONDS,
      expires_at: expiresAt,
      refresh_after_seconds: REFRESH_AFTER_SECONDS,
    },
  });
});

// POST /checkins  (kiosk at the door: header x-kiosk-key + body { token })
router.post('/checkins', (req, res) => {
  const keyState = kioskKeyCheck(req);
  if (keyState === 'not_configured') {
    return res.status(503).json({ success: false, message: 'Kiosk check-in is not configured on the server' });
  }
  if (keyState === 'bad') {
    return res.status(401).json({ success: false, message: 'Invalid kiosk key' });
  }

  const token = (req.body || {}).token;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, checkinSecret());
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    return res.status(400).json({
      success: false,
      message: expired ? 'QR code expired. Ask the member to refresh it' : 'Invalid QR code',
    });
  }
  if (payload.type !== 'checkin' || !Number.isInteger(payload.id)) {
    return res.status(400).json({ success: false, message: 'Invalid QR code' });
  }

  const result = core.performCheckin({ userId: payload.id, source: 'qr', checkedInBy: null });
  if (!result.ok) {
    return res.status(result.status).json({ success: false, message: result.message });
  }

  res.json({ success: true, message: result.message, data: result.data });
});

// GET /gym/busy  (member) -> real number: distinct members checked in during the last hour
router.get('/gym/busy', requireAuth, (req, res) => {
  const since = new Date(Date.now() - BUSY_WINDOW_MINUTES * 60 * 1000).toISOString();
  const row = db
    .prepare('SELECT COUNT(DISTINCT user_id) AS n FROM CheckIns WHERE checked_in_at >= ?')
    .get(since);

  res.json({
    success: true,
    message: 'Gym activity loaded',
    data: {
      members_checked_in: row.n,
      window_minutes: BUSY_WINDOW_MINUTES,
    },
  });
});

module.exports = router;
