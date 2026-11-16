// Integration tests for equipment reports: location, dates, "my reports" and the hourly limit.
// Run with the server already started: npm start   (then in a second terminal)  node test-reports.js
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
  const email = `reptest-${tag}-${Date.now()}@fitkats.com`;
  const r = await call('POST', '/register', { email, password: 'Test1234', display_name: `Tester ${tag}` });
  return { token: r.json.token, id: r.json.user.id };
}

async function run() {
  console.log(`Testing equipment reports at ${BASE}\n`);
  const a = await newMember('a');
  const b = await newMember('b');
  const c = await newMember('c');
  const created = [a.id, b.id, c.id];

  try {
    // ---- Auth ----
    let r = await call('GET', '/reports');
    check('My reports blocked without login', r.status === 401);
    r = await call('POST', '/report-issue', { description: 'Treadmill is broken' });
    check('Sending a report blocked without login', r.status === 401);

    // ---- Empty start ----
    r = await call('GET', '/reports', null, a.token);
    check('New member has no reports', r.status === 200 && r.json.count === 0);

    // ---- Old-style call (description only) still works ----
    r = await call('POST', '/report-issue', { description: 'Treadmill 2 belt is slipping' }, a.token);
    check('Description-only report still works', r.status === 201 && r.json.data.status === 'Open');
    check('Description-only report has no location but a real date',
      r.json.data.location === null && typeof r.json.data.created_at === 'string'
      && !Number.isNaN(Date.parse(r.json.data.created_at)));

    // ---- With location ----
    r = await call('POST', '/report-issue', { description: 'Cable machine pulley is stuck', location: '  Free weights area ' }, a.token);
    check('Report with a location is saved (trimmed)', r.status === 201 && r.json.data.location === 'Free weights area');
    r = await call('POST', '/report-issue', { description: 'Locker 14 door will not close', location: '   ' }, a.token);
    check('Blank location is stored as no location', r.status === 201 && r.json.data.location === null);

    // ---- Validation ----
    r = await call('POST', '/report-issue', { description: 'ab' }, b.token);
    check('Too-short description rejected (400)', r.status === 400);
    r = await call('POST', '/report-issue', { description: '        ' }, b.token);
    check('Whitespace-only description rejected (400)', r.status === 400);
    r = await call('POST', '/report-issue', { description: 'x'.repeat(501) }, b.token);
    check('Over-long description rejected (400)', r.status === 400);
    r = await call('POST', '/report-issue', { description: 'Mirror is cracked', location: 'L'.repeat(61) }, b.token);
    check('Over-long location rejected (400)', r.status === 400);
    r = await call('POST', '/report-issue', { description: 'Mirror is cracked', location: 123 }, b.token);
    check('Non-text location rejected (400)', r.status === 400);
    r = await call('GET', '/reports', null, b.token);
    check('Rejected reports were not saved', r.json.count === 0);

    // ---- My reports ----
    r = await call('GET', '/reports', null, a.token);
    check('My reports lists all 3, newest first',
      r.status === 200 && r.json.count === 3 && r.json.data[0].description === 'Locker 14 door will not close'
      && r.json.data[2].description === 'Treadmill 2 belt is slipping');
    check('My reports never expose user ids', r.json.data.every((x) => !('user_id' in x)));
    r = await call('GET', '/reports?limit=2', null, a.token);
    check('Limit parameter is respected', r.json.count === 2);
    r = await call('GET', '/reports', null, b.token);
    check("Member B cannot see Member A's reports", r.json.count === 0);

    // ---- Old reports from before the migration have no date, and must not break the list ----
    db.prepare("INSERT INTO Reports (user_id, description, status) VALUES (?, 'Old report from before dates existed', 'Resolved')").run(b.id);
    r = await call('GET', '/reports', null, b.token);
    check('Pre-migration report shows with a null date and its status',
      r.status === 200 && r.json.count === 1 && r.json.data[0].created_at === null && r.json.data[0].status === 'Resolved');

    // ---- Hourly limit ----
    for (let i = 1; i <= 5; i++) {
      r = await call('POST', '/report-issue', { description: `Spam test report number ${i}` }, c.token);
      if (r.status !== 201) break;
    }
    check('A member can send 5 reports in an hour', r.status === 201);
    r = await call('POST', '/report-issue', { description: 'Spam test report number 6' }, c.token);
    check('The 6th report in an hour is refused (429)', r.status === 429);
    r = await call('GET', '/reports', null, c.token);
    check('Only 5 reports were saved for that member', r.json.count === 5);
    r = await call('POST', '/report-issue', { description: 'A normal report from someone else' }, b.token);
    check("The limit is per member, so Member B is unaffected", r.status === 201);
  } finally {
    created.forEach((id) => db.prepare('DELETE FROM Users WHERE id = ?').run(id)); // cascades to reports
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run crashed:', err.message);
  process.exit(1);
});
