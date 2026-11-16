const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const core = require('../checkinCore');

const router = express.Router();

// GET /me -> who am I, my role, and whether I can check in right now (used by the website)
router.get('/me', requireAuth, (req, res) => {
  const u = db.prepare(`
    SELECT id, email, display_name, role, is_active, verification_status, phone,
           membership_tier, membership_expiry, loyalty_points, created_at, activated_at
    FROM Users WHERE id = ?`).get(req.userId);

  const problem = core.eligibilityProblem(u);

  res.json({
    success: true,
    message: 'Account loaded',
    data: {
      ...u,
      is_active: u.is_active === 1,
      can_check_in: problem === null,
      check_in_message: problem,
    },
  });
});

module.exports = router;
