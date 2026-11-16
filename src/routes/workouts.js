const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const loyalty = require('../loyalty');

const router = express.Router();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Checks the text is a real calendar date (UTC on both sides, so time zones don't matter)
function isRealDate(text) {
  if (!DATE_REGEX.test(text)) return false;
  const d = new Date(text + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

function parseId(text) {
  return /^\d+$/.test(String(text)) && Number(text) > 0 ? Number(text) : null;
}

// Validates a full set of workout fields. Returns { error } or { values }.
function validate({ exercise_name, sets, reps, weight, date }) {
  const exercise = String(exercise_name || '').trim();
  const s = Number(sets);
  const r = Number(reps);
  const w = Number(weight);
  const d = String(date).trim();

  if (exercise.length < 2 || exercise.length > 50) return { error: 'Exercise name must be 2 to 50 characters' };
  if (!Number.isInteger(s) || s < 1 || s > 20) return { error: 'Sets must be a whole number from 1 to 20' };
  if (!Number.isInteger(r) || r < 1 || r > 100) return { error: 'Reps must be a whole number from 1 to 100' };
  if (!Number.isFinite(w) || w < 0 || w > 500) return { error: 'Weight must be a number from 0 to 500 kg' };
  if (!isRealDate(d)) return { error: 'Date must be a real date like 2026-10-12' };
  return { values: { exercise, sets: s, reps: r, weight: w, date: d } };
}

// POST /add-workout
router.post('/add-workout', requireAuth, (req, res) => {
  const body = req.body || {};
  const check = validate({
    exercise_name: body.exercise_name,
    sets: body.sets,
    reps: body.reps,
    weight: body.weight,
    date: body.date ? body.date : loyalty.saDate(),
  });
  if (check.error) return res.status(400).json({ success: false, message: check.error });
  const v = check.values;

  const save = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO Workouts (user_id, exercise_name, sets, reps, weight, date)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.userId, v.exercise, v.sets, v.reps, v.weight, v.date);
    const workoutId = Number(result.lastInsertRowid);
    const earned = loyalty.awardForWorkout(req.userId, workoutId);
    return { workoutId, earned };
  });

  const { workoutId, earned } = save();
  const workout = db.prepare('SELECT * FROM Workouts WHERE id = ?').get(workoutId);
  const points = db.prepare('SELECT loyalty_points FROM Users WHERE id = ?').get(req.userId).loyalty_points;
  const maxPerDay = loyalty.MAX_REWARDED_WORKOUTS_PER_DAY * loyalty.POINTS_PER_WORKOUT;

  res.status(201).json({
    success: true,
    message: earned > 0
      ? `Workout saved. You earned ${earned} points!`
      : `Workout saved. You've reached today's points limit (${maxPerDay} points a day).`,
    data: workout,
    points_awarded: earned,
    loyalty_points: points,
  });
});

// GET /workouts  (newest first)
router.get('/workouts', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, exercise_name, sets, reps, weight, date
    FROM Workouts
    WHERE user_id = ?
    ORDER BY date DESC, id DESC`).all(req.userId);

  res.json({ success: true, message: 'Workouts loaded', count: rows.length, data: rows });
});

// PUT /workouts/:id  (send any of exercise_name, sets, reps, weight, date; the rest stay as they are)
router.put('/workouts/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid workout id' });

  const body = req.body || {};
  const fields = ['exercise_name', 'sets', 'reps', 'weight', 'date'];
  if (!fields.some((f) => body[f] !== undefined)) {
    return res.status(400).json({ success: false, message: 'Nothing to update' });
  }

  const existing = db.prepare('SELECT * FROM Workouts WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!existing) return res.status(404).json({ success: false, message: 'Workout not found' });

  const check = validate({
    exercise_name: body.exercise_name !== undefined ? body.exercise_name : existing.exercise_name,
    sets: body.sets !== undefined ? body.sets : existing.sets,
    reps: body.reps !== undefined ? body.reps : existing.reps,
    weight: body.weight !== undefined ? body.weight : existing.weight,
    date: body.date !== undefined ? body.date : existing.date,
  });
  if (check.error) return res.status(400).json({ success: false, message: check.error });
  const v = check.values;

  db.prepare(`
    UPDATE Workouts SET exercise_name = ?, sets = ?, reps = ?, weight = ?, date = ?
    WHERE id = ? AND user_id = ?`).run(v.exercise, v.sets, v.reps, v.weight, v.date, id, req.userId);

  const workout = db.prepare(
    'SELECT id, exercise_name, sets, reps, weight, date FROM Workouts WHERE id = ?').get(id);
  res.json({ success: true, message: 'Workout updated', data: workout });
});

// DELETE /workouts/:id  (points already earned stay in the ledger; deleting never frees the daily cap)
router.delete('/workouts/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid workout id' });

  const result = db.prepare('DELETE FROM Workouts WHERE id = ? AND user_id = ?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Workout not found' });

  res.json({ success: true, message: 'Workout deleted' });
});

module.exports = router;
