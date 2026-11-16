const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Shape sent to the app for one booking
function loadBooking(bookingId, userId) {
  return db.prepare(`
    SELECT b.id, b.class_id, b.status, b.created_at,
           c.title, c.coach, c.starts_at, c.ends_at
    FROM Bookings b
    JOIN Classes c ON c.id = b.class_id
    WHERE b.id = ? AND b.user_id = ?`).get(bookingId, userId);
}

// POST /bookings  { class_id }
// All checks AND the insert happen inside one transaction, so two members can never
// grab the last spot at the same time.
router.post('/bookings', requireAuth, (req, res) => {
  const classId = Number(req.body.class_id);
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ success: false, message: 'A valid class_id is required' });
  }

  const book = db.transaction(() => {
    const cls = db.prepare('SELECT * FROM Classes WHERE id = ?').get(classId);
    if (!cls || cls.is_cancelled) {
      return { status: 404, message: 'That class is not available' };
    }
    if (cls.starts_at <= new Date().toISOString()) {
      return { status: 400, message: 'This class has already started' };
    }

    const existing = db
      .prepare('SELECT id, status FROM Bookings WHERE class_id = ? AND user_id = ?')
      .get(classId, req.userId);
    if (existing && existing.status === 'Confirmed') {
      return { status: 409, message: 'You have already booked this class' };
    }

    const taken = db
      .prepare("SELECT COUNT(*) AS n FROM Bookings WHERE class_id = ? AND status = 'Confirmed'")
      .get(classId).n;
    if (taken >= cls.capacity) {
      return { status: 409, message: 'Sorry, this class is full' };
    }

    let bookingId;
    if (existing) {
      db.prepare("UPDATE Bookings SET status = 'Confirmed', updated_at = datetime('now') WHERE id = ?")
        .run(existing.id);
      bookingId = existing.id;
    } else {
      bookingId = db
        .prepare('INSERT INTO Bookings (class_id, user_id) VALUES (?, ?)')
        .run(classId, req.userId).lastInsertRowid;
    }
    return { status: 201, bookingId, spotsLeft: cls.capacity - taken - 1 };
  });

  const result = book();
  if (result.status !== 201) {
    return res.status(result.status).json({ success: false, message: result.message });
  }

  res.status(201).json({
    success: true,
    message: 'Class booked',
    data: loadBooking(result.bookingId, req.userId),
    spots_left: result.spotsLeft,
  });
});

// DELETE /bookings/:id  -> cancel one of MY bookings
router.delete('/bookings/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid booking id' });
  }

  // user_id is part of the lookup: someone else's booking looks exactly like a missing one
  const booking = db.prepare(`
    SELECT b.id, c.starts_at
    FROM Bookings b JOIN Classes c ON c.id = b.class_id
    WHERE b.id = ? AND b.user_id = ? AND b.status = 'Confirmed'`).get(id, req.userId);

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }
  if (booking.starts_at <= new Date().toISOString()) {
    return res.status(400).json({ success: false, message: 'This class has already started' });
  }

  db.prepare("UPDATE Bookings SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(id);

  res.json({ success: true, message: 'Booking cancelled', data: loadBooking(id, req.userId) });
});

// GET /bookings  -> my booking history (newest class first)
router.get('/bookings', requireAuth, (req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT b.id, b.class_id, b.status, b.created_at,
           c.title, c.coach, c.starts_at, c.ends_at
    FROM Bookings b
    JOIN Classes c ON c.id = b.class_id
    WHERE b.user_id = ?
    ORDER BY c.starts_at DESC
    LIMIT 100`).all(req.userId);

  const data = rows.map((r) => ({ ...r, is_upcoming: r.status === 'Confirmed' && r.starts_at > now }));
  res.json({ success: true, message: 'Bookings loaded', count: data.length, data });
});

module.exports = router;
