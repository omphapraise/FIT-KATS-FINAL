const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const setupCodes = require('../setupCodes');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;   // attempts per IP + email per 15 minutes
const MAX_PER_IP = 100;    // attempts per IP per 15 minutes
const INVALID = 'This setup code is invalid or has expired';

// Small in-memory limiter (resets when the server restarts)
const buckets = new Map();
function allow(key, max) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}

// POST /activate  (PUBLIC)  body { email, code, password }
// A walk-in member sets their OWN password with the one-time code staff gave them.
router.post('/activate', (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const ip = req.ip || 'unknown';

  if (!allow('ip:' + ip, MAX_PER_IP) || !allow('em:' + ip + ':' + email, MAX_PER_EMAIL)) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Please try again later' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ success: false, message: 'Password must be 8 to 72 characters' });
  }
  if (setupCodes.normalise(body.code).length !== setupCodes.CODE_LENGTH) {
    return res.status(400).json({ success: false, message: INVALID });
  }

  const row = db.prepare(`
    SELECT ps.id, ps.user_id, ps.expires_at, ps.used_at, ps.revoked_at,
           u.email, u.is_active, u.verification_status
    FROM PasswordSetups ps
    JOIN Users u ON u.id = ps.user_id
    WHERE ps.code_hash = ?`).get(setupCodes.hashCode(body.code));

  const now = new Date();
  const valid =
    row &&
    row.email === email &&
    row.used_at === null &&
    row.revoked_at === null &&
    Date.parse(row.expires_at) > now.getTime() &&
    row.is_active === 1 &&
    row.verification_status !== 'rejected';

  // One generic message for every failure so nothing is revealed
  if (!valid) {
    return res.status(400).json({ success: false, message: INVALID });
  }

  const nowIso = now.toISOString();
  const hash = bcrypt.hashSync(password, 10);

  db.transaction(() => {
    db.prepare('UPDATE Users SET password = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE PasswordSetups SET used_at = ? WHERE id = ?').run(nowIso, row.id);
    db.prepare('UPDATE PasswordSetups SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL')
      .run(nowIso, row.user_id);
    db.prepare('INSERT INTO AuditLog (actor_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
      .run(row.user_id, 'member.password_set', 'user', row.user_id, JSON.stringify({ via: 'setup_code' }));
  })();

  res.json({ success: true, message: 'Password set. You can now log in.' });
});

module.exports = router;
