const BASE = process.env.API_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

function check(name, condition) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
  }
}

async function run() {
  console.log(`Testing Fit Kats API at ${BASE}\n`);

  // Health
  let r = await call('GET', '/health');
  check('Health check responds ok', r.status === 200 && r.json.status === 'ok');

  // Login
  r = await call('POST', '/login', { email: 'demo@fitkats.com', password: 'Password123' });
  check('Login works with correct details', r.status === 200 && !!r.json.token);
  const token = r.json.token;

  r = await call('POST', '/login', { email: 'demo@fitkats.com', password: 'wrongpass' });
  check('Login rejects wrong password', r.status === 401);

  r = await call('POST', '/login', {});
  check('Login rejects empty fields', r.status === 400);

  // Register
  r = await call('POST', '/register', { email: 'bad-email', password: '123456', display_name: 'Test' });
  check('Register rejects invalid email', r.status === 400);

  r = await call('POST', '/register', { email: 'x@test.com', password: '123', display_name: 'Test' });
  check('Register rejects short password', r.status === 400);

  r = await call('POST', '/register', { email: 'demo@fitkats.com', password: 'Password123', display_name: 'Dup' });
  check('Register rejects duplicate email', r.status === 409);

  const newEmail = `test${Date.now()}@fitkats.com`;
  r = await call('POST', '/register', { email: newEmail, password: 'Test1234', display_name: 'Test User' });
  check('Register creates a new account', r.status === 201 && !!r.json.token);
  const freshToken = r.json.token; // brand-new member: 0 points, daily cap not used

  // Protected routes need a token
  r = await call('GET', '/profile');
  check('Profile blocked without login', r.status === 401);

  // Profile
  r = await call('GET', '/profile', null, token);
  check('Profile loads for logged-in user', r.status === 200 && r.json.data.email === 'demo@fitkats.com');

  r = await call('POST', '/update-profile', { display_name: 'A' }, token);
  check('Update-profile rejects too-short name', r.status === 400);

  r = await call('POST', '/update-profile', { display_name: 'Demo Member', notifications_enabled: false }, token);
  check('Update-profile saves changes', r.status === 200 && r.json.data.notifications_enabled === false);
  await call('POST', '/update-profile', { notifications_enabled: true }, token); // put it back

  // Workouts (demo member: saving works even when the daily points cap is already used up)
  r = await call('POST', '/add-workout', { exercise_name: 'Test Curl', sets: 3, reps: 10, weight: 20 }, token);
  check('Add-workout saves a valid workout', r.status === 201);

  // Loyalty: use the brand-new member so the daily cap from earlier runs can't interfere
  const before = (await call('GET', '/profile', null, freshToken)).json.data.loyalty_points;
  r = await call('POST', '/add-workout', { exercise_name: 'Test Curl', sets: 3, reps: 10, weight: 20 }, freshToken);
  const after = (await call('GET', '/profile', null, freshToken)).json.data.loyalty_points;
  check('Loyalty points increase after a workout', r.status === 201 && after === before + 10);

  r = await call('POST', '/add-workout', { exercise_name: 'X', sets: 0, reps: -5, weight: 'abc' }, token);
  check('Add-workout rejects invalid input', r.status === 400);

  r = await call('POST', '/add-workout', { exercise_name: 'Squat', sets: 3, reps: 10, weight: 50, date: '2026-13-45' }, token);
  check('Add-workout rejects an impossible date', r.status === 400);

  r = await call('GET', '/workouts', null, token);
  check('Workouts list loads', r.status === 200 && Array.isArray(r.json.data) && r.json.data.length >= 12);

  // Payments
  r = await call('GET', '/payments', null, token);
  check('Payments list loads', r.status === 200 && Array.isArray(r.json.data) && r.json.data.length >= 3);

  // Reports
  r = await call('POST', '/report-issue', { description: 'ab' }, token);
  check('Report-issue rejects a too-short description', r.status === 400);

  r = await call('POST', '/report-issue', { description: 'Treadmill 2 belt is slipping' }, token);
  check('Report-issue saves a valid report', r.status === 201);

  // Unknown route
  r = await call('GET', '/does-not-exist');
  check('Unknown route returns 404 JSON', r.status === 404);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Could not reach the API. Is the server running?', err.message);
  process.exit(1);
});