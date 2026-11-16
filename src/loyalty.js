// Loyalty points: all changes go through here so the ledger and the cached balance never drift apart.
const db = require('./db');

const POINTS_PER_WORKOUT = 10;
const MAX_REWARDED_WORKOUTS_PER_DAY = 3;

// South Africa has no daylight saving, so SAST is always UTC+2
function saDate(now = new Date()) {
  return new Date(now.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

// Call inside db.transaction(). Returns false if this exact award already exists.
function award(userId, points, reason, ref) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO LoyaltyTransactions (user_id, points, reason, ref, award_day)
    VALUES (?, ?, ?, ?, ?)`).run(userId, points, reason, ref, saDate());
  if (r.changes === 0) return false;
  db.prepare('UPDATE Users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(points, userId);
  return true;
}

function rewardedWorkoutsToday(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM LoyaltyTransactions
    WHERE user_id = ? AND reason = 'WORKOUT' AND award_day = ? AND points > 0`)
    .get(userId, saDate()).n;
}

// Call inside db.transaction(). Returns points actually earned (0 once the daily cap is hit).
function awardForWorkout(userId, workoutId) {
  if (rewardedWorkoutsToday(userId) >= MAX_REWARDED_WORKOUTS_PER_DAY) return 0;
  return award(userId, POINTS_PER_WORKOUT, 'WORKOUT', `workout:${workoutId}`) ? POINTS_PER_WORKOUT : 0;
}

module.exports = { POINTS_PER_WORKOUT, MAX_REWARDED_WORKOUTS_PER_DAY, saDate, award, rewardedWorkoutsToday, awardForWorkout };
