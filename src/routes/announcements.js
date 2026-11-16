const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /announcements  (pinned first, then newest) with a read flag for me. Published only.
router.get('/announcements', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.title, a.body, a.published_at, a.is_pinned,
           CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM Announcements a
    LEFT JOIN AnnouncementReads r ON r.announcement_id = a.id AND r.user_id = ?
    WHERE a.status = 'published'
    ORDER BY a.is_pinned DESC, a.published_at DESC, a.id DESC
    LIMIT 50`).all(req.userId);

  const data = rows.map((r) => ({ ...r, is_pinned: r.is_pinned === 1, is_read: r.is_read === 1 }));
  const unread = data.filter((a) => !a.is_read).length;

  res.json({ success: true, message: 'Announcements loaded', count: data.length, unread_count: unread, data });
});

// POST /announcements/:id/read
router.post('/announcements/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid announcement id' });
  }
  const exists = db.prepare("SELECT id FROM Announcements WHERE id = ? AND status = 'published'").get(id);
  if (!exists) {
    return res.status(404).json({ success: false, message: 'Announcement not found' });
  }
  db.prepare('INSERT OR IGNORE INTO AnnouncementReads (user_id, announcement_id) VALUES (?, ?)')
    .run(req.userId, id);
  res.json({ success: true, message: 'Marked as read' });
});

module.exports = router;
