const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const MAX_SERIES_POINTS = 30;

const round1 = (n) => Math.round(n * 10) / 10;

// GET /progress  - per-exercise stats. "Bench Press" and "bench press" count as the same exercise.
router.get('/progress', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, exercise_name, sets, reps, weight, date
    FROM Workouts WHERE user_id = ?
    ORDER BY date ASC, id ASC`).all(req.userId);

  const groups = new Map();
  let totalVolume = 0;

  for (const w of rows) {
    const key = w.exercise_name.trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { entries: 0, total_volume: 0, total_reps: 0, best_weight: -1, best_weight_date: null, days: new Map() });
    }
    const g = groups.get(key);
    const volume = w.sets * w.reps * w.weight;

    g.display_name = w.exercise_name;          // rows are oldest to newest, so this ends as the latest spelling
    g.last_date = w.date;
    g.entries += 1;
    g.total_volume += volume;
    g.total_reps += w.sets * w.reps;
    totalVolume += volume;
    if (w.weight > g.best_weight) { g.best_weight = w.weight; g.best_weight_date = w.date; }

    const day = g.days.get(w.date) || { date: w.date, best_weight: 0, volume: 0 };
    day.best_weight = Math.max(day.best_weight, w.weight);
    day.volume += volume;
    g.days.set(w.date, day);
  }

  const exercises = [...groups.values()].map((g) => ({
    exercise_name: g.display_name,
    entries: g.entries,
    best_weight: g.best_weight,
    best_weight_date: g.best_weight_date,
    total_volume: round1(g.total_volume),
    total_reps: g.total_reps,
    last_date: g.last_date,
    series: [...g.days.values()]
      .map((d) => ({ date: d.date, best_weight: d.best_weight, volume: round1(d.volume) }))
      .slice(-MAX_SERIES_POINTS),
  }));
  exercises.sort((a, b) => (a.last_date < b.last_date ? 1 : a.last_date > b.last_date ? -1 : b.entries - a.entries));

  res.json({
    success: true,
    message: 'Progress loaded',
    data: {
      summary: { total_workouts: rows.length, total_volume: round1(totalVolume), exercise_count: exercises.length },
      exercises,
    },
  });
});

module.exports = router;
