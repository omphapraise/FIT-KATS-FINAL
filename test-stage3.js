// Integration tests for Stage 3(a): loyalty ledger, daily points cap, workout edit/delete, progress.
// Run with the server already started: npm start   (then in a second terminal)  node test-stage3.js
// Creates its own throwaway members and cleans them up at the end.
const db = require('./src/db');

const BASE = process.env.API_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

function check(name, condition) {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

async function newMember(tag) {
  const email = `stage3-${tag}-${Date.now()}@fitkats.com`;
  const r = await call('POST', '/register', { email, password: 'Test1234', display_name: `Tester ${tag}` });
  return { token: r.json.token, id: r.json.user.id };
}

const ledgerSum = (id) => db.prepare('SELECT COALESCE(SUM(points),0) AS s FROM LoyaltyTransactions WHERE user_id = ?').get(id).s;
const cachedBalance = (id) => db.prepare('SELECT loyalty_points AS p FROM Users WHERE id = ?').get(id).p;

async function run() {
  console.log(`Testing Stage 3(a) at ${BASE}\n`);
  const a = await newMember('a');
  const b = await newMember('b');
  const p = await newMember('p');
  const q = await newMember('q');
  const created = [a.id, b.id, p.id, q.id];

  try {
    // ---- Auth is required ----
    let r = await call('PUT', '/workouts/1', { sets: 3 });
    check('Edit blocked without login', r.status === 401);
    r = await call('DELETE', '/workouts/1');
    check('Delete blocked without login', r.status === 401);
    r = await call('GET', '/progress');
    check('Progress blocked without login', r.status === 401);
    r = await call('GET', '/loyalty');
    check('Loyalty blocked without login', r.status === 401);

    // ---- New member starts clean ----
    r = await call('GET', '/loyalty', null, a.token);
    check('New member has 0 points and an empty ledger',
      r.status === 200 && r.json.data.balance === 0 && r.json.data.transactions.length === 0);

    // ---- Points and the daily cap ----
    const bench = { exercise_name: 'Bench Press', sets: 3, reps: 10, weight: 40 };
    const ids = [];
    for (let i = 1; i <= 3; i++) {
      r = await call('POST', '/add-workout', bench, a.token);
      ids.push(r.json.data && r.json.data.id);
      check(`Workout ${i} today earns 10 points`, r.status === 201 && r.json.points_awarded === 10);
    }
    r = await call('POST', '/add-workout', bench, a.token);
    check('Workout 4 today is saved but earns 0 points',
      r.status === 201 && r.json.points_awarded === 0 && r.json.loyalty_points === 30);

    r = await call('GET', '/loyalty', null, a.token);
    check('Loyalty shows balance 30 and 3 workout rows',
      r.json.data.balance === 30 && r.json.data.transactions.length === 3
      && r.json.data.transactions[0].reason === 'WORKOUT' && r.json.data.rewarded_workouts_today === 3);
    check('Ledger total equals the cached balance', ledgerSum(a.id) === 30 && cachedBalance(a.id) === 30);

    r = await call('GET', '/loyalty?limit=2', null, a.token);
    check('Loyalty limit parameter is respected', r.json.data.transactions.length === 2);

    let threw = false;
    try {
      db.prepare("INSERT INTO LoyaltyTransactions (user_id, points, reason, ref) VALUES (?, 10, 'WORKOUT', ?)")
        .run(a.id, `workout:${ids[0]}`);
    } catch (e) { threw = true; }
    check('Database refuses a second award for the same workout', threw && ledgerSum(a.id) === 30);

    // ---- Edit ----
    r = await call('PUT', `/workouts/${ids[0]}`, { exercise_name: 'Back Squat', sets: 5, reps: 5, weight: 60 }, a.token);
    check('Member edits own workout',
      r.status === 200 && r.json.data.exercise_name === 'Back Squat' && r.json.data.sets === 5 && r.json.data.weight === 60);
    r = await call('GET', '/loyalty', null, a.token);
    check('Editing does not change points', r.json.data.balance === 30);

    r = await call('PUT', `/workouts/${ids[0]}`, { sets: 0 }, a.token);
    check('Edit rejects invalid sets (400)', r.status === 400);
    r = await call('PUT', `/workouts/${ids[0]}`, { date: '2026-02-31' }, a.token);
    check('Edit rejects a fake date (400)', r.status === 400);
    r = await call('PUT', `/workouts/${ids[0]}`, {}, a.token);
    check('Edit with nothing to change returns 400', r.status === 400);
    r = await call('PUT', '/workouts/abc', { sets: 3 }, a.token);
    check('Edit with non-numeric id returns 400', r.status === 400);
    r = await call('PUT', '/workouts/999999', { sets: 3 }, a.token);
    check('Edit unknown workout returns 404', r.status === 404);
    r = await call('PUT', `/workouts/${ids[1]}`, { weight: 999 }, b.token);
    check("Member B cannot edit Member A's workout (404)", r.status === 404);
    const untouched = db.prepare('SELECT weight FROM Workouts WHERE id = ?').get(ids[1]);
    check("Member A's workout is unchanged after B's attempt", untouched.weight === 40);

    // ---- Delete ----
    r = await call('DELETE', `/workouts/${ids[1]}`, null, b.token);
    check("Member B cannot delete Member A's workout (404)", r.status === 404);
    r = await call('DELETE', `/workouts/${ids[0]}`, null, a.token);
    check('Member deletes own workout', r.status === 200);
    r = await call('GET', '/workouts', null, a.token);
    check('Deleted workout is gone from history', !(r.json.data || []).find((w) => w.id === ids[0]));
    r = await call('DELETE', `/workouts/${ids[0]}`, null, a.token);
    check('Deleting twice returns 404', r.status === 404);
    r = await call('GET', '/loyalty', null, a.token);
    check('Deleting does not remove earned points', r.json.data.balance === 30 && ledgerSum(a.id) === 30);
    r = await call('POST', '/add-workout', bench, a.token);
    check('Deleting a workout does not free up the daily cap', r.status === 201 && r.json.points_awarded === 0);

    // ---- Progress ----
    r = await call('GET', '/progress', null, q.token);
    check('Member with no workouts gets empty progress',
      r.status === 200 && r.json.data.exercises.length === 0 && r.json.data.summary.total_workouts === 0);

    await call('POST', '/add-workout', { exercise_name: 'Bench Press', sets: 3, reps: 10, weight: 40, date: '2026-10-01' }, p.token);
    await call('POST', '/add-workout', { exercise_name: 'bench press', sets: 3, reps: 8, weight: 50, date: '2026-10-08' }, p.token);
    await call('POST', '/add-workout', { exercise_name: 'Bench Press', sets: 4, reps: 6, weight: 45, date: '2026-10-08' }, p.token);
    await call('POST', '/add-workout', { exercise_name: 'Squat', sets: 4, reps: 5, weight: 80, date: '2026-10-08' }, p.token);
    r = await call('GET', '/progress', null, p.token);
    const ex = r.json.data && r.json.data.exercises;
    const benchP = ex && ex.find((e) => e.exercise_name.toLowerCase() === 'bench press');
    check('Progress groups exercise names ignoring case (2 exercises)', ex && ex.length === 2 && !!benchP);
    check('Bench best weight is 50 on 2026-10-08', benchP && benchP.best_weight === 50 && benchP.best_weight_date === '2026-10-08');
    check('Bench has 3 entries and total volume 3480', benchP && benchP.entries === 3 && benchP.total_volume === 3480);
    check('Bench series has one point per day with summed volume',
      benchP && benchP.series.length === 2 && benchP.series[0].date === '2026-10-01'
      && benchP.series[0].volume === 1200 && benchP.series[1].volume === 2280 && benchP.series[1].best_weight === 50);
    check('Progress summary counts all 4 workouts', r.json.data.summary.total_workouts === 4);
    r = await call('GET', '/progress', null, a.token);
    check("Member A's progress does not include Member P's exercises",
      !(r.json.data.exercises || []).find((e) => e.exercise_name === 'Squat'));
  } finally {
    created.forEach((id) => db.prepare('DELETE FROM Users WHERE id = ?').run(id));
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run crashed:', err.message);
  process.exit(1);
});
