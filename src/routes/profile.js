const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

function loadProfile(userId) {
  const user = db.prepare(`
    SELECT id, email, display_name, membership_tier, membership_expiry, loyalty_points
    FROM Users WHERE id = ?`).get(userId);

  const settings = db
    .prepare('SELECT notifications_enabled FROM Settings WHERE user_id = ?')
    .get(userId);

  const workoutCount = db
    .prepare('SELECT COUNT(*) AS n FROM Workouts WHERE user_id = ?')
    .get(userId).n;

  return {
    ...user,
    notifications_enabled: settings ? settings.notifications_enabled === 1 : true,
    total_workouts: workoutCount,
  };
}

// GET /profile
router.get('/profile', requireAuth, (req, res) => {
  res.json({ success: true, message: 'Profile loaded', data: loadProfile(req.userId) });
});

// POST /update-profile
router.post('/update-profile', requireAuth, (req, res) => {
  const { display_name, notifications_enabled } = req.body;

  if (display_name === undefined && notifications_enabled === undefined) {
    return res.status(400).json({ success: false, message: 'Nothing to update' });
  }

  if (display_name !== undefined) {
    const name = String(display_name).trim();
    if (name.length < 2 || name.length > 40) {
      return res.status(400).json({ success: false, message: 'Display name must be 2 to 40 characters' });
    }
  }

  if (notifications_enabled !== undefined && typeof notifications_enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'notifications_enabled must be true or false' });
  }

  const update = db.transaction(() => {
    if (display_name !== undefined) {
      db.prepare('UPDATE Users SET display_name = ? WHERE id = ?')
        .run(String(display_name).trim(), req.userId);
    }
    if (notifications_enabled !== undefined) {
      // Insert if missing, otherwise update
      db.prepare(`
        INSERT INTO Settings (user_id, notifications_enabled) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET notifications_enabled = excluded.notifications_enabled`)
        .run(req.userId, notifications_enabled ? 1 : 0);
    }
  });
  update();

  res.json({ success: true, message: 'Profile updated', data: loadProfile(req.userId) });
});

module.exports = router;