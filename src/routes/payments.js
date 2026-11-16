const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const DEMO_NOTICE =
  'These are sample records for demonstration. No payment provider is connected yet, ' +
  'so no real payments have been taken.';

// GET /payments  (newest first)
router.get('/payments', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, amount, status, date, is_demo, provider
    FROM Payments
    WHERE user_id = ?
    ORDER BY date DESC, id DESC`).all(req.userId)
    .map((p) => ({ ...p, is_demo: p.is_demo === 1 }));

  // Only show the notice when the list actually contains demo records
  const hasDemo = rows.some((p) => p.is_demo);

  res.json({
    success: true,
    message: 'Payments loaded',
    count: rows.length,
    notice: hasDemo ? DEMO_NOTICE : null,
    data: rows,
  });
});

module.exports = router;
