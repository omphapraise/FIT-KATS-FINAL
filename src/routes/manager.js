const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const { requireRole } = requireAuth;
const router = express.Router();

// Every /manager route is manager-only (role read from the DB per request). Read-only aggregates, no writes.
router.use('/manager', requireAuth, requireRole('manager'));

const DEMO_NOTICE =
  'These are sample records for demonstration. No payment provider is connected yet, ' +
  'so no real payments have been taken.';

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
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
// Rejects bad formats and impossible calendar dates (2001-13-01, 2001-02-30) without throwing.
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
// from/to as YYYY-MM-DD. Defaults: to = SA today, from = 29 days earlier. Maximum span 366 days.
function parseRange(q) {
  const to = q.to === undefined ? saToday() : q.to;
  if (!validDate(to)) return { error: 'to must be a date like 2026-11-30' };
  const from = q.from === undefined ? addDays(to, -29) : q.from;
  if (!validDate(from)) return { error: 'from must be a date like 2026-11-01' };
  if (from > to) return { error: 'from must not be after to' };
  const span = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (span > 365) return { error: 'The date range can be at most 366 days' };
  return { from, to };
}

const STATUS_CASE = `CASE
  WHEN is_active = 0 THEN 'deactivated'
  WHEN verification_status = 'pending' THEN 'pending'
  WHEN verification_status = 'rejected' THEN 'rejected'
  WHEN membership_expiry >= ? THEN 'active'
  ELSE 'expired' END`;

const SA_DAY = "date(checked_in_at, '+2 hours')";

// ---------- overview (not date-bound) ----------
router.get('/manager/overview', (req, res) => {
  const today = saToday();
  const byStatus = { active: 0, expired: 0, pending: 0, rejected: 0, deactivated: 0 };
  let total = 0;
  db.prepare(`SELECT ${STATUS_CASE} AS st, COUNT(*) AS n FROM Users WHERE role = 'member' GROUP BY st`)
    .all(today)
    .forEach((r) => { byStatus[r.st] = r.n; total += r.n; });

  const tiers = db
    .prepare(`SELECT membership_tier AS tier, COUNT(*) AS count FROM Users
              WHERE role = 'member' AND is_active = 1 AND verification_status = 'verified' AND membership_expiry >= ?
              GROUP BY membership_tier ORDER BY count DESC, tier ASC`)
    .all(today);
  const expiringSoon = db
    .prepare(`SELECT COUNT(*) AS n FROM Users
              WHERE role = 'member' AND is_active = 1 AND verification_status = 'verified'
              AND membership_expiry >= ? AND membership_expiry <= ?`)
    .get(today, addDays(today, 7)).n;

  const checkToday = db.prepare(`SELECT COUNT(*) AS n FROM CheckIns WHERE ${SA_DAY} = ?`).get(today).n;
  const check7 = db.prepare(`SELECT COUNT(*) AS n FROM CheckIns WHERE ${SA_DAY} >= ? AND ${SA_DAY} <= ?`)
    .get(addDays(today, -6), today).n;

  const classesUpcoming = db
    .prepare('SELECT COUNT(*) AS n FROM Classes WHERE is_cancelled = 0 AND starts_at >= ?')
    .get(new Date().toISOString()).n;
  const rep = { Open: 0, 'In Progress': 0, Resolved: 0 };
  db.prepare('SELECT status, COUNT(*) AS n FROM Reports GROUP BY status').all().forEach((r) => { rep[r.status] = r.n; });
  const announcements = db.prepare("SELECT COUNT(*) AS n FROM Announcements WHERE status = 'published'").get().n;

  send(res, 200, 'Overview loaded', {
    data: {
      today,
      members: { total, ...byStatus, expiring_soon: expiringSoon },
      tiers,
      checkins: { today: checkToday, last_7_days: check7 },
      classes_upcoming: classesUpcoming,
      reports: { open: rep.Open, in_progress: rep['In Progress'] },
      announcements_published: announcements,
    },
  });
});

// ---------- membership: tier by status ----------
router.get('/manager/membership', (req, res) => {
  const today = saToday();
  const map = {};
  db.prepare(`SELECT membership_tier AS tier, ${STATUS_CASE} AS st, COUNT(*) AS n FROM Users
              WHERE role = 'member' GROUP BY tier, st`)
    .all(today)
    .forEach((r) => {
      if (!map[r.tier]) map[r.tier] = { tier: r.tier, active: 0, expired: 0, pending: 0, rejected: 0, deactivated: 0, total: 0 };
      map[r.tier][r.st] = r.n;
      map[r.tier].total += r.n;
    });
  const rows = Object.values(map).sort((a, b) => b.total - a.total || a.tier.localeCompare(b.tier));
  send(res, 200, 'Membership loaded', { data: { today, tiers: rows } });
});

// ---------- revenue (demonstration records only) ----------
router.get('/manager/revenue', (req, res) => {
  const range = parseRange(req.query);
  if (range.error) return send(res, 400, range.error);
  const { from, to } = range;
  const W = 'substr(date, 1, 10) BETWEEN ? AND ?';

  const totals = { paid: 0, pending: 0, failed: 0 };
  const counts = { paid: 0, pending: 0, failed: 0 };
  db.prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM Payments WHERE ${W} GROUP BY status`)
    .all(from, to)
    .forEach((r) => {
      const k = String(r.status).toLowerCase();
      if (k in totals) { totals[k] = round2(r.total); counts[k] = r.n; }
    });
  const byDay = db
    .prepare(`SELECT substr(date, 1, 10) AS date, COALESCE(SUM(amount), 0) AS paid FROM Payments
              WHERE status = 'Paid' AND ${W} GROUP BY substr(date, 1, 10) ORDER BY date ASC`)
    .all(from, to)
    .map((r) => ({ date: r.date, paid: round2(r.paid) }));
  const byType = db
    .prepare(`SELECT COALESCE(payment_type, 'membership') AS payment_type, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS paid
              FROM Payments WHERE status = 'Paid' AND ${W} GROUP BY COALESCE(payment_type, 'membership') ORDER BY paid DESC`)
    .all(from, to)
    .map((r) => ({ payment_type: r.payment_type, count: r.count, paid: round2(r.paid) }));
  const demo = db.prepare(`SELECT COUNT(*) AS n FROM Payments WHERE ${W} AND is_demo = 1`).get(from, to).n;
  const real = db.prepare(`SELECT COUNT(*) AS n FROM Payments WHERE ${W} AND is_demo = 0`).get(from, to).n;

  send(res, 200, 'Revenue loaded', {
    notice: demo > 0 ? DEMO_NOTICE : null,
    data: { from, to, all_demo: real === 0, totals, counts, by_day: byDay, by_type: byType },
  });
});

// ---------- attendance and capacity ----------
router.get('/manager/attendance', (req, res) => {
  const range = parseRange(req.query);
  if (range.error) return send(res, 400, range.error);
  const { from, to } = range;
  const W = `${SA_DAY} BETWEEN ? AND ?`;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM CheckIns WHERE ${W}`).get(from, to).n;
  const unique = db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM CheckIns WHERE ${W}`).get(from, to).n;
  const byDay = db
    .prepare(`SELECT ${SA_DAY} AS date, COUNT(*) AS count FROM CheckIns WHERE ${W} GROUP BY ${SA_DAY} ORDER BY date ASC`)
    .all(from, to);
  const bySource = db
    .prepare(`SELECT source, COUNT(*) AS count FROM CheckIns WHERE ${W} GROUP BY source ORDER BY count DESC, source ASC`)
    .all(from, to);

  const cls = db
    .prepare(`SELECT c.capacity, (SELECT COUNT(*) FROM Bookings b WHERE b.class_id = c.id AND b.status = 'Confirmed') AS booked
              FROM Classes c WHERE c.is_cancelled = 0 AND substr(c.starts_at, 1, 10) BETWEEN ? AND ?`)
    .all(from, to);
  const capacity = cls.reduce((s, c) => s + c.capacity, 0);
  const booked = cls.reduce((s, c) => s + c.booked, 0);

  send(res, 200, 'Attendance loaded', {
    data: {
      from, to, total, unique_members: unique, by_day: byDay, by_source: bySource,
      classes: { count: cls.length, capacity, booked, fill_rate: capacity > 0 ? Math.round((booked / capacity) * 1000) / 1000 : null },
    },
  });
});

// ---------- maintenance ----------
router.get('/manager/maintenance', (req, res) => {
  const range = parseRange(req.query);
  if (range.error) return send(res, 400, range.error);
  const { from, to } = range;
  const W = 'substr(created_at, 1, 10) BETWEEN ? AND ?';

  const byStatus = { Open: 0, 'In Progress': 0, Resolved: 0 };
  let total = 0;
  db.prepare(`SELECT status, COUNT(*) AS n FROM Reports WHERE ${W} GROUP BY status`).all(from, to)
    .forEach((r) => { byStatus[r.status] = r.n; total += r.n; });
  const bySeverity = { High: 0, Medium: 0, Low: 0, Unrated: 0 };
  db.prepare(`SELECT COALESCE(severity, 'Unrated') AS sev, COUNT(*) AS n FROM Reports WHERE ${W} GROUP BY sev`).all(from, to)
    .forEach((r) => { bySeverity[r.sev] = r.n; });
  const avg = db
    .prepare(`SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) AS h, COUNT(*) AS n FROM Reports
              WHERE status = 'Resolved' AND updated_at IS NOT NULL AND ${W}`)
    .get(from, to);
  const backlog = { open: 0, in_progress: 0 };
  db.prepare("SELECT status, COUNT(*) AS n FROM Reports WHERE status IN ('Open','In Progress') GROUP BY status").all()
    .forEach((r) => { if (r.status === 'Open') backlog.open = r.n; else backlog.in_progress = r.n; });

  send(res, 200, 'Maintenance loaded', {
    data: {
      from, to, total, by_status: byStatus, by_severity: bySeverity,
      avg_resolution_hours: avg.n > 0 && avg.h !== null ? Math.round(avg.h * 10) / 10 : null,
      resolved_count: avg.n,
      backlog,
    },
  });
});

// ---------- staff directory (read-only) ----------
router.get('/manager/staff', (req, res) => {
  const rows = db
    .prepare(`SELECT u.id, u.display_name, u.email, u.role, u.is_active,
                (SELECT COUNT(*) FROM Reports r WHERE r.assigned_to = u.id AND r.status <> 'Resolved') AS open_reports
              FROM Users u WHERE u.role IN ('staff','manager')
              ORDER BY u.role DESC, u.display_name COLLATE NOCASE ASC, u.id ASC`)
    .all()
    .map((r) => ({ ...r, is_active: r.is_active === 1 }));
  send(res, 200, 'Staff loaded', { count: rows.length, data: rows });
});

module.exports = router;
