const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const loyalty = require('../loyalty');

const router = express.Router();

const LABELS = {
  WORKOUT: 'Workout logged',
  ADJUSTMENT: 'Balance carried over',
  REDEMPTION: 'Reward redeemed',
  REFERRAL: 'Referral bonus',
};

// GET /loyalty?limit=50  - balance, today's cap status and recent transactions (newest first)
router.get('/loyalty', requireAuth, (req, res) => {
  let limit = Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 100);

  const balance = db.prepare('SELECT loyalty_points FROM Users WHERE id = ?').get(req.userId).loyalty_points;
  const rewardedToday = loyalty.rewardedWorkoutsToday(req.userId);

  const transactions = db.prepare(`
    SELECT id, points, reason, ref, created_at
    FROM LoyaltyTransactions WHERE user_id = ?
    ORDER BY id DESC LIMIT ?`).all(req.userId, limit)
    .map((t) => ({ ...t, label: LABELS[t.reason] || t.reason }));

  res.json({
    success: true,
    message: 'Loyalty loaded',
    data: {
      balance,
      points_per_workout: loyalty.POINTS_PER_WORKOUT,
      max_rewarded_workouts_per_day: loyalty.MAX_REWARDED_WORKOUTS_PER_DAY,
      rewarded_workouts_today: rewardedToday,
      points_earned_from_workouts_today: rewardedToday * loyalty.POINTS_PER_WORKOUT,
      transactions,
    },
  });
});

module.exports = router;
