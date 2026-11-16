const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Spam guard: a member can send at most this many reports in any rolling hour
const MAX_REPORTS_PER_HOUR = 5;
// Fixed response columns: keeps the Android responses identical
const COLUMNS = 'id, description, location, status, created_at';
const SEVERITIES = ['Low', 'Medium', 'High'];

// Optional trimmed text field; '' becomes null. Returns { value } or { error }.
function optionalText(raw, label, max) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: `${label} must be text` };
  const v = raw.trim();
  if (v.length > max) return { error: `${label} is too long (maximum ${max} characters)` };
  return { value: v === '' ? null : v };
}

// POST /report-issue   body: { description, location?, severity?, equipment_name? }
router.post('/report-issue', requireAuth, (req, res) => {
  const body = req.body || {};
  const description = String(body.description || '').trim();

  const loc = optionalText(body.location, 'Location', 60);
  if (loc.error) return res.status(400).json({ success: false, message: loc.error });
  const equip = optionalText(body.equipment_name, 'Equipment name', 60);
  if (equip.error) return res.status(400).json({ success: false, message: equip.error });
  const sev = optionalText(body.severity, 'Severity', 10);
  if (sev.error) return res.status(400).json({ success: false, message: sev.error });
  if (sev.value !== null && !SEVERITIES.includes(sev.value)) {
    return res.status(400).json({ success: false, message: 'Severity must be Low, Medium or High' });
  }

  if (description.length < 5) {
    return res.status(400).json({ success: false, message: 'Please describe the problem (at least 5 characters)' });
  }
  if (description.length > 500) {
    return res.status(400).json({ success: false, message: 'Description is too long (maximum 500 characters)' });
  }

  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const recent = db
    .prepare('SELECT COUNT(*) AS n FROM Reports WHERE user_id = ? AND created_at >= ?')
    .get(req.userId, hourAgo).n;
  if (recent >= MAX_REPORTS_PER_HOUR) {
    return res.status(429).json({
      success: false,
      message: 'You have sent several reports in the last hour. Please try again a bit later',
    });
  }

  const nowIso = new Date().toISOString();
  const reportId = db.transaction(() => {
    const result = db
      .prepare(`INSERT INTO Reports (user_id, description, location, status, created_at, severity, equipment_name, updated_at)
                VALUES (?, ?, ?, 'Open', ?, ?, ?, ?)`)
      .run(req.userId, description, loc.value, nowIso, sev.value, equip.value, nowIso);
    db.prepare('INSERT INTO ReportEvents (report_id, actor_id, from_status, to_status) VALUES (?, ?, NULL, ?)')
      .run(result.lastInsertRowid, req.userId, 'Open');
    return result.lastInsertRowid;
  })();

  const report = db.prepare(`SELECT ${COLUMNS} FROM Reports WHERE id = ?`).get(reportId);

  res.status(201).json({
    success: true,
    message: 'Thank you. Your report has been sent to our team',
    data: report,
  });
});

// GET /reports?limit=50   my own reports, newest first
router.get('/reports', requireAuth, (req, res) => {
  let limit = Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 100);

  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM Reports WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(req.userId, limit);

  res.json({ success: true, message: 'Reports loaded', count: rows.length, data: rows });
});

module.exports = router;
