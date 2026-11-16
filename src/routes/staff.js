const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const core = require('../checkinCore');
const setupCodes = require('../setupCodes');

const { requireRole } = requireAuth;
const router = express.Router();

// Every /staff route needs a logged-in, active staff member or manager (role read from the DB per request).
router.use('/staff', requireAuth, requireRole('staff', 'manager'));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;
const TIERS = ['Silver', 'Gold', 'Platinum'];
const ID_TYPES = ['sa_id', 'passport', 'drivers_licence', 'other'];
const REPORT_STATUSES = ['Open', 'In Progress', 'Resolved'];
const SEVERITIES = ['Low', 'Medium', 'High'];
const SIGNUP_FEE_RAND = 200;
const MEMBERSHIP_DAYS = 30;
const SETUP_CODE_HOURS = 24;
const DEMO_NOTICE =
  'These are sample records for demonstration. No payment provider is connected yet, ' +
  'so no real payments have been taken.';

// ---------- helpers ----------
function saToday() {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function send(res, status, message, extra) {
  return res.status(status).json(Object.assign({ success: status < 400, message }, extra || {}));
}
function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function listLimit(raw, def, max) {
  let n = Number(raw);
  if (!Number.isInteger(n) || n < 1) n = def;
  return Math.min(n, max);
}
function cleanText(raw, label, min, max) {
  if (typeof raw !== 'string') return { error: `${label} is required` };
  const v = raw.trim();
  if (v.length === 0) return { error: `${label} is required` };
  if (v.length < min) return { error: `${label} must be at least ${min} characters` };
  if (v.length > max) return { error: `${label} is too long (maximum ${max} characters)` };
  return { value: v };
}
function isUnique(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}
function audit(actorId, action, targetType, targetId, detail) {
  db.prepare('INSERT INTO AuditLog (actor_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(actorId, action, targetType, targetId, detail === undefined ? null : JSON.stringify(detail));
}

const MEMBER_COLUMNS =
  'id, email, display_name, phone, membership_tier, membership_expiry, loyalty_points, ' +
  'verification_status, id_type_sighted, is_active, created_at, activated_at';

function loadMember(id) {
  return db.prepare(`SELECT ${MEMBER_COLUMNS} FROM Users WHERE id = ? AND role = 'member'`).get(id);
}
function memberView(row) {
  const problem = core.eligibilityProblem(row);
  return {
    ...row,
    is_active: row.is_active === 1,
    membership_status: core.membershipStatus(row.membership_expiry),
    can_check_in: problem === null,
    check_in_message: problem,
  };
}

// Revokes every open code for the member and issues a new one. Only the hash is stored.
function issueSetupCode(userId, staffId) {
  const now = new Date();
  db.prepare('UPDATE PasswordSetups SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL')
    .run(now.toISOString(), userId);
  const code = setupCodes.generateCode();
  const expiresAt = new Date(now.getTime() + SETUP_CODE_HOURS * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO PasswordSetups (user_id, code_hash, expires_at, created_by) VALUES (?, ?, ?, ?)')
    .run(userId, setupCodes.hashCode(code), expiresAt, staffId);
  return { code, expiresAt };
}

function checkinSecret() {
  return (process.env.JWT_SECRET || 'dev_secret') + ':checkin'; // same derivation as routes/checkins.js
}

// ---------- members ----------
router.get('/staff/members', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const status = req.query.status;
  if (status !== undefined && !['pending', 'verified', 'rejected'].includes(status)) {
    return send(res, 400, 'Status must be pending, verified or rejected');
  }
  const limit = listLimit(req.query.limit, 25, 100);
  let offset = Number(req.query.offset);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  const where = ["role = 'member'"];
  const params = [];
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    where.push("(display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  if (status) {
    where.push('verification_status = ?');
    params.push(status);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM Users WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM Users WHERE ${clause} ORDER BY display_name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(memberView);
  send(res, 200, 'Members loaded', { count: rows.length, total, data: rows });
});

router.get('/staff/members/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  const member = loadMember(id);
  if (!member) return send(res, 404, 'Member not found');

  const nowIso = new Date().toISOString();
  const checkins = db
    .prepare(`SELECT c.id, c.checked_in_at, c.source, c.checked_in_by, s.display_name AS checked_in_by_name
              FROM CheckIns c LEFT JOIN Users s ON s.id = c.checked_in_by
              WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 10`).all(id);
  const payments = db
    .prepare(`SELECT id, amount, status, date, is_demo, provider, payment_type
              FROM Payments WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 10`).all(id)
    .map((p) => ({ ...p, is_demo: p.is_demo === 1 }));
  const notes = db
    .prepare(`SELECT n.id, n.note, n.created_at, n.author_id, a.display_name AS author_name
              FROM StaffNotes n LEFT JOIN Users a ON a.id = n.author_id
              WHERE n.member_id = ? ORDER BY n.id DESC LIMIT 20`).all(id);
  const upcoming = db
    .prepare(`SELECT COUNT(*) AS n FROM Bookings b JOIN Classes c ON c.id = b.class_id
              WHERE b.user_id = ? AND b.status = 'Confirmed' AND c.is_cancelled = 0 AND c.starts_at > ?`)
    .get(id, nowIso).n;
  const openCode = db
    .prepare(`SELECT COUNT(*) AS n FROM PasswordSetups
              WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
    .get(id, nowIso).n;

  send(res, 200, 'Member loaded', {
    data: {
      member: memberView(member),
      recent_checkins: checkins,
      payments,
      payments_notice: payments.some((p) => p.is_demo) ? DEMO_NOTICE : null,
      notes,
      upcoming_bookings: upcoming,
      has_open_setup_code: openCode > 0,
    },
  });
});

// Walk-in registration. The member sets their own password later with the one-time setup code.
router.post('/staff/members', (req, res) => {
  const b = req.body || {};
  const name = cleanText(b.display_name, 'Name', 2, 40);
  if (name.error) return send(res, 400, name.error);

  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 120) return send(res, 400, 'Please enter a valid email address');

  let phone = null;
  if (b.phone !== undefined && b.phone !== null && b.phone !== '') {
    if (typeof b.phone !== 'string' || !PHONE_REGEX.test(b.phone.trim())) {
      return send(res, 400, 'Please enter a valid phone number');
    }
    phone = b.phone.trim();
  }
  if (!TIERS.includes(b.membership_tier)) {
    return send(res, 400, 'Membership tier must be Silver, Gold or Platinum');
  }
  if (db.prepare('SELECT id FROM Users WHERE email = ?').get(email)) {
    return send(res, 409, 'An account with this email already exists');
  }

  const unusable = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const nowIso = new Date().toISOString();
  let created;
  try {
    created = db.transaction(() => {
      const r = db.prepare(
        `INSERT INTO Users (email, password, display_name, membership_tier, membership_expiry, phone, created_at, verification_status)
         VALUES (?, ?, ?, ?, '1970-01-01', ?, ?, 'pending')`
      ).run(email, unusable, name.value, b.membership_tier, phone, nowIso);
      const userId = Number(r.lastInsertRowid);
      db.prepare('INSERT INTO Settings (user_id, notifications_enabled) VALUES (?, 1)').run(userId);
      db.prepare(
        `INSERT INTO Payments (user_id, amount, status, date, is_demo, provider, payment_type)
         VALUES (?, ?, 'Pending', ?, 1, NULL, 'signup_fee')`
      ).run(userId, SIGNUP_FEE_RAND, saToday());
      const issued = issueSetupCode(userId, req.userId);
      audit(req.userId, 'member.walkin_registered', 'member', userId, { tier: b.membership_tier, via: 'staff' });
      return { userId, issued };
    })();
  } catch (err) {
    if (isUnique(err)) return send(res, 409, 'An account with this email already exists');
    throw err;
  }

  send(res, 201, 'Walk-in registered. Give the member their setup code now: it is shown only once.', {
    data: {
      member: memberView(loadMember(created.userId)),
      setup_code: created.issued.code,
      setup_code_expires_at: created.issued.expiresAt,
      signup_fee: { amount: SIGNUP_FEE_RAND, status: 'Pending', is_demo: true },
    },
  });
});

router.post('/staff/members/:id/setup-code', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  const member = loadMember(id);
  if (!member) return send(res, 404, 'Member not found');
  if (member.is_active !== 1) return send(res, 409, 'This account is not active');
  if (member.verification_status === 'rejected') return send(res, 409, 'This sign-up was rejected');

  const issued = db.transaction(() => {
    const out = issueSetupCode(id, req.userId);
    audit(req.userId, 'member.setup_code_issued', 'member', id, { via: 'staff' });
    return out;
  })();
  send(res, 200, 'New setup code created. It is shown only once.', {
    data: { setup_code: issued.code, setup_code_expires_at: issued.expiresAt },
  });
});

// body: { decision: 'approve' | 'reject', id_type, reason }  (ID type only, never an ID number)
router.post('/staff/members/:id/verify', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  const member = loadMember(id);
  if (!member) return send(res, 404, 'Member not found');
  const b = req.body || {};
  if (b.decision !== 'approve' && b.decision !== 'reject') {
    return send(res, 400, 'Decision must be approve or reject');
  }
  let idType = null;
  if (b.id_type !== undefined && b.id_type !== null && b.id_type !== '') {
    if (!ID_TYPES.includes(b.id_type)) {
      return send(res, 400, 'ID type must be sa_id, passport, drivers_licence or other');
    }
    idType = b.id_type;
  }
  let reason = null;
  if (b.decision === 'approve') {
    if (!idType) return send(res, 400, 'Record the type of ID you sighted');
  } else {
    const r = cleanText(b.reason, 'Reason', 3, 300);
    if (r.error) return send(res, 400, r.error);
    reason = r.value;
  }
  if (member.verification_status !== 'pending') {
    return send(res, 409, `This sign-up has already been ${member.verification_status}`);
  }

  const nowIso = new Date().toISOString();
  if (b.decision === 'approve') {
    const expiry = addDays(saToday(), MEMBERSHIP_DAYS);
    db.transaction(() => {
      db.prepare(
        "UPDATE Users SET verification_status = 'verified', id_type_sighted = ?, activated_at = ?, membership_expiry = ? WHERE id = ?"
      ).run(idType, nowIso, expiry, id);
      db.prepare("UPDATE Payments SET status = 'Paid' WHERE user_id = ? AND payment_type = 'signup_fee' AND status = 'Pending'")
        .run(id);
      audit(req.userId, 'member.verified', 'member', id, { id_type: idType, membership_expiry: expiry });
    })();
  } else {
    db.transaction(() => {
      db.prepare("UPDATE Users SET verification_status = 'rejected', id_type_sighted = ? WHERE id = ?").run(idType, id);
      db.prepare('UPDATE PasswordSetups SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL')
        .run(nowIso, id);
      audit(req.userId, 'member.rejected', 'member', id, { reason, id_type: idType });
    })();
  }
  send(res, 200, b.decision === 'approve' ? 'Member verified' : 'Sign-up rejected', {
    data: { member: memberView(loadMember(id)) },
  });
});

// ---------- check-in ----------
router.post('/staff/members/:id/checkin', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  if (!loadMember(id)) return send(res, 404, 'Member not found');
  const result = core.performCheckin({ userId: id, source: 'manual', checkedInBy: req.userId });
  if (!result.ok) return send(res, result.status, result.message);
  send(res, 200, result.message, { data: result.data });
});

// body: { token } from the member's QR code
router.post('/staff/checkin/scan', (req, res) => {
  const token = (req.body || {}).token;
  if (typeof token !== 'string' || !token) return send(res, 400, 'Token is required');
  let payload;
  try {
    payload = jwt.verify(token, checkinSecret());
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    return send(res, 400, expired ? 'QR code expired. Ask the member to refresh it' : 'Invalid QR code');
  }
  if (payload.type !== 'checkin' || !Number.isInteger(payload.id)) return send(res, 400, 'Invalid QR code');
  const result = core.performCheckin({ userId: payload.id, source: 'staff_qr', checkedInBy: req.userId });
  if (!result.ok) return send(res, result.status, result.message);
  send(res, 200, result.message, { data: result.data });
});

router.get('/staff/checkins', (req, res) => {
  const limit = listLimit(req.query.limit, 50, 200);
  const rows = db
    .prepare(`SELECT c.id, c.user_id, u.display_name, c.checked_in_at, c.source, c.checked_in_by, s.display_name AS checked_in_by_name
              FROM CheckIns c JOIN Users u ON u.id = c.user_id LEFT JOIN Users s ON s.id = c.checked_in_by
              ORDER BY c.id DESC LIMIT ?`).all(limit);
  send(res, 200, 'Check-ins loaded', { count: rows.length, data: rows });
});

// ---------- staff notes ----------
router.get('/staff/members/:id/notes', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  if (!loadMember(id)) return send(res, 404, 'Member not found');
  const rows = db
    .prepare(`SELECT n.id, n.note, n.created_at, n.author_id, a.display_name AS author_name
              FROM StaffNotes n LEFT JOIN Users a ON a.id = n.author_id
              WHERE n.member_id = ? ORDER BY n.id DESC LIMIT 50`).all(id);
  send(res, 200, 'Notes loaded', { count: rows.length, data: rows });
});

router.post('/staff/members/:id/notes', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid member id');
  if (!loadMember(id)) return send(res, 404, 'Member not found');
  const n = cleanText((req.body || {}).note, 'Note', 1, 1000);
  if (n.error) return send(res, 400, n.error);
  const r = db.prepare('INSERT INTO StaffNotes (member_id, author_id, note) VALUES (?, ?, ?)').run(id, req.userId, n.value);
  const row = db.prepare('SELECT id, note, created_at, author_id FROM StaffNotes WHERE id = ?').get(r.lastInsertRowid);
  send(res, 201, 'Note added', { data: row });
});

// ---------- classes ----------
const CLASS_SELECT = `
  SELECT c.id, c.title, c.description, c.coach, c.starts_at, c.ends_at, c.capacity, c.is_cancelled,
    (SELECT COUNT(*) FROM Bookings b WHERE b.class_id = c.id AND b.status = 'Confirmed') AS booked_count
  FROM Classes c`;

function classView(r) {
  return {
    id: r.id, title: r.title, description: r.description, coach: r.coach,
    starts_at: r.starts_at, ends_at: r.ends_at, capacity: r.capacity,
    booked_count: r.booked_count,
    spots_left: Math.max(r.capacity - r.booked_count, 0),
    is_cancelled: r.is_cancelled === 1,
  };
}
function loadClass(id) {
  return db.prepare(`${CLASS_SELECT} WHERE c.id = ?`).get(id);
}
function validateClass(f) {
  const title = cleanText(f.title, 'Title', 2, 80);
  if (title.error) return { error: title.error };
  const description = cleanText(f.description, 'Description', 1, 500);
  if (description.error) return { error: description.error };
  const coach = cleanText(f.coach, 'Coach', 2, 60);
  if (coach.error) return { error: coach.error };
  const s = typeof f.starts_at === 'string' ? Date.parse(f.starts_at) : NaN;
  const e = typeof f.ends_at === 'string' ? Date.parse(f.ends_at) : NaN;
  if (Number.isNaN(s)) return { error: 'Start time is not a valid date' };
  if (Number.isNaN(e)) return { error: 'End time is not a valid date' };
  if (e <= s) return { error: 'End time must be after the start time' };
  if (!Number.isInteger(f.capacity) || f.capacity < 1 || f.capacity > 500) {
    return { error: 'Capacity must be a whole number from 1 to 500' };
  }
  return {
    value: {
      title: title.value, description: description.value, coach: coach.value,
      starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), capacity: f.capacity,
    },
  };
}

router.get('/staff/classes', (req, res) => {
  const scope = req.query.scope === 'past' ? 'past' : req.query.scope === 'all' ? 'all' : 'upcoming';
  const limit = listLimit(req.query.limit, 100, 200);
  const nowIso = new Date().toISOString();
  let sql = CLASS_SELECT;
  const params = [];
  if (scope === 'upcoming') { sql += ' WHERE c.starts_at >= ? ORDER BY c.starts_at ASC'; params.push(nowIso); }
  else if (scope === 'past') { sql += ' WHERE c.starts_at < ? ORDER BY c.starts_at DESC'; params.push(nowIso); }
  else sql += ' ORDER BY c.starts_at DESC';
  const rows = db.prepare(sql + ' LIMIT ?').all(...params, limit).map(classView);
  send(res, 200, 'Classes loaded', { count: rows.length, data: rows });
});

router.get('/staff/classes/:id/bookings', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid class id');
  const cls = loadClass(id);
  if (!cls) return send(res, 404, 'Class not found');
  const rows = db
    .prepare(`SELECT b.id AS booking_id, u.id AS user_id, u.display_name, u.membership_tier, b.created_at
              FROM Bookings b JOIN Users u ON u.id = b.user_id
              WHERE b.class_id = ? AND b.status = 'Confirmed' ORDER BY b.id ASC`).all(id);
  send(res, 200, 'Bookings loaded', { count: rows.length, data: { class: classView(cls), bookings: rows } });
});

router.post('/staff/classes', (req, res) => {
  const v = validateClass(req.body || {});
  if (v.error) return send(res, 400, v.error);
  if (Date.parse(v.value.starts_at) <= Date.now()) return send(res, 400, 'Start time must be in the future');
  let id;
  try {
    id = db.transaction(() => {
      const r = db.prepare('INSERT INTO Classes (title, description, coach, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?, ?, ?)')
        .run(v.value.title, v.value.description, v.value.coach, v.value.starts_at, v.value.ends_at, v.value.capacity);
      audit(req.userId, 'class.created', 'class', Number(r.lastInsertRowid), { title: v.value.title, starts_at: v.value.starts_at });
      return Number(r.lastInsertRowid);
    })();
  } catch (err) {
    if (isUnique(err)) return send(res, 409, 'A class with this title and start time already exists');
    throw err;
  }
  send(res, 201, 'Class created', { data: classView(loadClass(id)) });
});

router.put('/staff/classes/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid class id');
  const cls = loadClass(id);
  if (!cls) return send(res, 404, 'Class not found');
  if (cls.is_cancelled === 1) return send(res, 409, 'A cancelled class cannot be edited');
  const b = req.body || {};
  const pick = (k) => (b[k] !== undefined ? b[k] : cls[k]);
  const v = validateClass({
    title: pick('title'), description: pick('description'), coach: pick('coach'),
    starts_at: pick('starts_at'), ends_at: pick('ends_at'), capacity: pick('capacity'),
  });
  if (v.error) return send(res, 400, v.error);
  if (v.value.starts_at !== new Date(cls.starts_at).toISOString() && Date.parse(v.value.starts_at) <= Date.now()) {
    return send(res, 400, 'Start time must be in the future');
  }
  if (v.value.capacity < cls.booked_count) {
    return send(res, 409, `Capacity cannot be lower than the ${cls.booked_count} confirmed bookings`);
  }
  try {
    db.transaction(() => {
      db.prepare('UPDATE Classes SET title = ?, description = ?, coach = ?, starts_at = ?, ends_at = ?, capacity = ? WHERE id = ?')
        .run(v.value.title, v.value.description, v.value.coach, v.value.starts_at, v.value.ends_at, v.value.capacity, id);
      audit(req.userId, 'class.updated', 'class', id, { title: v.value.title });
    })();
  } catch (err) {
    if (isUnique(err)) return send(res, 409, 'A class with this title and start time already exists');
    throw err;
  }
  send(res, 200, 'Class updated', { data: classView(loadClass(id)) });
});

// Cancelling flags the class. Existing bookings are left untouched (members' class list hides cancelled classes).
router.post('/staff/classes/:id/cancel', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid class id');
  const cls = loadClass(id);
  if (!cls) return send(res, 404, 'Class not found');
  if (cls.is_cancelled === 1) return send(res, 409, 'This class is already cancelled');
  db.transaction(() => {
    db.prepare('UPDATE Classes SET is_cancelled = 1 WHERE id = ?').run(id);
    audit(req.userId, 'class.cancelled', 'class', id, { title: cls.title, confirmed_bookings: cls.booked_count });
  })();
  send(res, 200, 'Class cancelled', { data: classView(loadClass(id)) });
});

// ---------- reports (maintenance) ----------
const REPORT_SELECT = `
  SELECT r.id, r.description, r.location, r.status, r.severity, r.equipment_name, r.assigned_to,
         r.resolution_note, r.created_at, r.updated_at, r.user_id,
         u.display_name AS reporter_name, a.display_name AS assignee_name
  FROM Reports r
  JOIN Users u ON u.id = r.user_id
  LEFT JOIN Users a ON a.id = r.assigned_to`;

router.get('/staff/reports', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status !== undefined) {
    if (!REPORT_STATUSES.includes(req.query.status)) return send(res, 400, 'Status must be Open, In Progress or Resolved');
    where.push('r.status = ?');
    params.push(req.query.status);
  }
  if (req.query.mine === '1') { where.push('r.assigned_to = ?'); params.push(req.userId); }
  const limit = listLimit(req.query.limit, 50, 200);
  const rows = db
    .prepare(`${REPORT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.id DESC LIMIT ?`)
    .all(...params, limit);
  send(res, 200, 'Reports loaded', { count: rows.length, data: rows });
});

router.get('/staff/reports/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid report id');
  const report = db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id);
  if (!report) return send(res, 404, 'Report not found');
  const events = db
    .prepare(`SELECT e.id, e.actor_id, a.display_name AS actor_name, e.from_status, e.to_status, e.note, e.created_at
              FROM ReportEvents e LEFT JOIN Users a ON a.id = e.actor_id
              WHERE e.report_id = ? ORDER BY e.id ASC`).all(id);
  send(res, 200, 'Report loaded', { data: { report, events } });
});

// body (any of): status, severity (or null), assigned_to (user id or null), resolution_note, note
router.patch('/staff/reports/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid report id');
  const r = db.prepare('SELECT id, status, severity, assigned_to, resolution_note FROM Reports WHERE id = ?').get(id);
  if (!r) return send(res, 404, 'Report not found');
  const b = req.body || {};

  let status = r.status;
  let severity = r.severity;
  let assigned = r.assigned_to;
  let resolution = r.resolution_note;
  let assigneeName = null;
  let eventNote = null;

  if (b.status !== undefined) {
    if (!REPORT_STATUSES.includes(b.status)) return send(res, 400, 'Status must be Open, In Progress or Resolved');
    status = b.status;
  }
  if (b.severity !== undefined) {
    if (b.severity === null) severity = null;
    else if (SEVERITIES.includes(b.severity)) severity = b.severity;
    else return send(res, 400, 'Severity must be Low, Medium or High');
  }
  if (b.assigned_to !== undefined) {
    if (b.assigned_to === null) assigned = null;
    else {
      const uid = Number.isInteger(b.assigned_to) && b.assigned_to > 0 ? b.assigned_to : null;
      const u = uid
        ? db.prepare("SELECT id, display_name FROM Users WHERE id = ? AND is_active = 1 AND role IN ('staff','manager')").get(uid)
        : null;
      if (!u) return send(res, 400, 'Assignee must be an active staff member');
      assigned = u.id;
      assigneeName = u.display_name;
    }
  }
  if (b.resolution_note !== undefined) {
    if (b.resolution_note === null) resolution = null;
    else {
      const t = cleanText(b.resolution_note, 'Resolution note', 1, 500);
      if (t.error) return send(res, 400, t.error);
      resolution = t.value;
    }
  }
  if (b.note !== undefined && b.note !== null) {
    const t = cleanText(b.note, 'Note', 1, 300);
    if (t.error) return send(res, 400, t.error);
    eventNote = t.value;
  }
  if (status === 'Resolved' && !resolution) {
    return send(res, 400, 'A resolution note is required to resolve a report');
  }

  const parts = [];
  if (assigned !== r.assigned_to) parts.push(assigned ? `Assigned to ${assigneeName}` : 'Unassigned');
  if (severity !== r.severity) parts.push(`Severity set to ${severity || 'none'}`);
  if (resolution !== r.resolution_note) parts.push('Resolution note updated');
  if (eventNote) parts.push(eventNote);
  if (status === r.status && parts.length === 0) return send(res, 400, 'Nothing to update');

  const nowIso = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE Reports SET status = ?, severity = ?, assigned_to = ?, resolution_note = ?, updated_at = ? WHERE id = ?')
      .run(status, severity, assigned, resolution, nowIso, id);
    db.prepare('INSERT INTO ReportEvents (report_id, actor_id, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.userId, r.status, status, parts.length ? parts.join('. ') : null);
    audit(req.userId, 'report.updated', 'report', id, { from: r.status, to: status });
  })();
  send(res, 200, 'Report updated', { data: db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id) });
});

// ---------- announcements ----------
const ANN_SELECT = `
  SELECT a.id, a.title, a.body, a.published_at, a.is_pinned, a.status, a.author_id, u.display_name AS author_name
  FROM Announcements a LEFT JOIN Users u ON u.id = a.author_id`;

function annView(r) {
  return { ...r, is_pinned: r.is_pinned === 1 };
}

router.get('/staff/announcements', (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !['published', 'archived'].includes(status)) {
    return send(res, 400, 'Status must be published or archived');
  }
  const limit = listLimit(req.query.limit, 100, 200);
  const rows = status
    ? db.prepare(`${ANN_SELECT} WHERE a.status = ? ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC LIMIT ?`).all(status, limit)
    : db.prepare(`${ANN_SELECT} ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC LIMIT ?`).all(limit);
  send(res, 200, 'Announcements loaded', { count: rows.length, data: rows.map(annView) });
});

router.post('/staff/announcements', (req, res) => {
  const b = req.body || {};
  const title = cleanText(b.title, 'Title', 2, 80);
  if (title.error) return send(res, 400, title.error);
  const body = cleanText(b.body, 'Body', 1, 1000);
  if (body.error) return send(res, 400, body.error);
  if (b.is_pinned !== undefined && typeof b.is_pinned !== 'boolean') return send(res, 400, 'Pinned must be true or false');
  if (db.prepare('SELECT id FROM Announcements WHERE title = ?').get(title.value)) {
    return send(res, 409, 'An announcement with this title already exists');
  }
  let id;
  try {
    id = db.transaction(() => {
      const r = db.prepare("INSERT INTO Announcements (title, body, published_at, is_pinned, author_id, status) VALUES (?, ?, ?, ?, ?, 'published')")
        .run(title.value, body.value, new Date().toISOString(), b.is_pinned ? 1 : 0, req.userId);
      audit(req.userId, 'announcement.created', 'announcement', Number(r.lastInsertRowid), { title: title.value });
      return Number(r.lastInsertRowid);
    })();
  } catch (err) {
    if (isUnique(err)) return send(res, 409, 'An announcement with this title already exists');
    throw err;
  }
  send(res, 201, 'Announcement published', { data: annView(db.prepare(`${ANN_SELECT} WHERE a.id = ?`).get(id)) });
});

router.put('/staff/announcements/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid announcement id');
  const a = db.prepare('SELECT id, title, body, is_pinned, status FROM Announcements WHERE id = ?').get(id);
  if (!a) return send(res, 404, 'Announcement not found');
  if (a.status === 'archived') return send(res, 409, 'Archived announcements cannot be edited');
  const b = req.body || {};
  const title = cleanText(b.title !== undefined ? b.title : a.title, 'Title', 2, 80);
  if (title.error) return send(res, 400, title.error);
  const body = cleanText(b.body !== undefined ? b.body : a.body, 'Body', 1, 1000);
  if (body.error) return send(res, 400, body.error);
  if (b.is_pinned !== undefined && typeof b.is_pinned !== 'boolean') return send(res, 400, 'Pinned must be true or false');
  const pinned = b.is_pinned !== undefined ? (b.is_pinned ? 1 : 0) : a.is_pinned;
  if (db.prepare('SELECT id FROM Announcements WHERE title = ? AND id <> ?').get(title.value, id)) {
    return send(res, 409, 'An announcement with this title already exists');
  }
  try {
    db.transaction(() => {
      db.prepare('UPDATE Announcements SET title = ?, body = ?, is_pinned = ? WHERE id = ?').run(title.value, body.value, pinned, id);
      audit(req.userId, 'announcement.updated', 'announcement', id, { title: title.value });
    })();
  } catch (err) {
    if (isUnique(err)) return send(res, 409, 'An announcement with this title already exists');
    throw err;
  }
  send(res, 200, 'Announcement updated', { data: annView(db.prepare(`${ANN_SELECT} WHERE a.id = ?`).get(id)) });
});

router.post('/staff/announcements/:id/archive', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return send(res, 400, 'Invalid announcement id');
  const a = db.prepare('SELECT id, title, status FROM Announcements WHERE id = ?').get(id);
  if (!a) return send(res, 404, 'Announcement not found');
  if (a.status === 'archived') return send(res, 409, 'This announcement is already archived');
  db.transaction(() => {
    db.prepare("UPDATE Announcements SET status = 'archived' WHERE id = ?").run(id);
    audit(req.userId, 'announcement.archived', 'announcement', id, { title: a.title });
  })();
  send(res, 200, 'Announcement archived', { data: annView(db.prepare(`${ANN_SELECT} WHERE a.id = ?`).get(id)) });
});

// ---------- audit log (manager only) ----------
router.get('/staff/audit-log', requireRole('manager'), (req, res) => {
  const limit = listLimit(req.query.limit, 50, 200);
  const where = [];
  const params = [];
  const before = parseId(req.query.before);
  if (before) { where.push('l.id < ?'); params.push(before); }
  if (typeof req.query.action === 'string' && req.query.action) { where.push('l.action = ?'); params.push(req.query.action); }
  if (typeof req.query.target_type === 'string' && req.query.target_type) { where.push('l.target_type = ?'); params.push(req.query.target_type); }
  const actor = parseId(req.query.actor_id);
  if (actor) { where.push('l.actor_id = ?'); params.push(actor); }

  const rows = db
    .prepare(`SELECT l.id, l.actor_id, u.display_name AS actor_name, l.action, l.target_type, l.target_id, l.detail, l.created_at
              FROM AuditLog l LEFT JOIN Users u ON u.id = l.actor_id
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY l.id DESC LIMIT ?`)
    .all(...params, limit)
    .map((r) => {
      let detail = null;
      if (r.detail) { try { detail = JSON.parse(r.detail); } catch (e) { detail = null; } }
      return { ...r, detail };
    });
  send(res, 200, 'Audit log loaded', {
    count: rows.length,
    next_before: rows.length === limit ? rows[rows.length - 1].id : null,
    data: rows,
  });
});

module.exports = router;
