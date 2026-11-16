const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /classes  -> upcoming classes with live capacity and whether *I* have booked each one
router.get('/classes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.title, c.description, c.coach, c.starts_at, c.ends_at, c.capacity,
      (SELECT COUNT(*) FROM Bookings b
        WHERE b.class_id = c.id AND b.status = 'Confirmed') AS booked_count,
      (SELECT b.id FROM Bookings b
        WHERE b.class_id = c.id AND b.user_id = ? AND b.status = 'Confirmed') AS my_booking_id
    FROM Classes c
    WHERE c.is_cancelled = 0 AND c.starts_at > ?
    ORDER BY c.starts_at ASC
    LIMIT 50`).all(req.userId, new Date().toISOString());

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    coach: r.coach,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    capacity: r.capacity,
    spots_left: Math.max(r.capacity - r.booked_count, 0),
    is_full: r.booked_count >= r.capacity,
    is_booked: r.my_booking_id !== null,
    my_booking_id: r.my_booking_id,
  }));

  res.json({ success: true, message: 'Classes loaded', count: data.length, data });
});

module.exports = router;
