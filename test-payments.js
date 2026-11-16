// Integration tests for the payments demo flag.
// Run with the server already started: npm start   (then in a second terminal)  node test-payments.js
// Needs the seeded demo member (demo@fitkats.com). Creates throwaway members and cleans them up.
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
  const email = `paytest-${tag}-${Date.now()}@fitkats.com`;
  const r = await call('POST', '/register', { email, password: 'Test1234', display_name: `Tester ${tag}` });
  return { token: r.json.token, id: r.json.user.id };
}

async function run() {
  console.log(`Testing payments demo flag at ${BASE}\n`);
  const a = await newMember('a');
  const b = await newMember('b');
  const created = [a.id, b.id];

  try {
    let r = await call('GET', '/payments');
    check('Payments blocked without login', r.status === 401);

    r = await call('GET', '/payments', null, a.token);
    check('New member has no payments and no notice', r.status === 200 && r.json.count === 0 && r.json.notice === null);

    // A row inserted the old way (no is_demo given) must default to DEMO, never "real"
    db.prepare("INSERT INTO Payments (user_id, amount, status, date) VALUES (?, 899, 'Paid', '2026-10-01')").run(a.id);
    r = await call('GET', '/payments', null, a.token);
    check('Payment without an explicit flag defaults to demo', r.json.count === 1 && r.json.data[0].is_demo === true);
    check('Demo payments have no provider', r.json.data[0].provider === null);
    check('Notice explains these are sample records and no provider is connected',
      typeof r.json.notice === 'string' && r.json.notice.includes('sample') && r.json.notice.includes('No payment provider'));

    // A real (provider-created) row is reported as real
    db.prepare("INSERT INTO Payments (user_id, amount, status, date, is_demo, provider) VALUES (?, 899, 'Paid', '2026-11-01', 0, 'test-provider')").run(a.id);
    r = await call('GET', '/payments', null, a.token);
    const real = r.json.data.find((p) => p.is_demo === false);
    const demo = r.json.data.find((p) => p.is_demo === true);
    check('A provider payment is flagged real with its provider', !!real && real.provider === 'test-provider');
    check('Real and demo rows can sit side by side, newest first',
      !!demo && r.json.data[0].date === '2026-11-01' && r.json.data[1].date === '2026-10-01');
    check('Notice is still shown while demo rows are in the list', r.json.notice !== null);

    // A member with ONLY real payments gets no demo notice
    db.prepare("INSERT INTO Payments (user_id, amount, status, date, is_demo, provider) VALUES (?, 499, 'Paid', '2026-11-01', 0, 'test-provider')").run(b.id);
    r = await call('GET', '/payments', null, b.token);
    check('A member with only real payments gets no demo notice', r.json.count === 1 && r.json.notice === null && r.json.data[0].is_demo === false);

    // Ownership
    r = await call('GET', '/payments', null, b.token);
    check("Member B cannot see Member A's payments", r.json.count === 1 && r.json.data[0].amount === 499);

    // The database refuses nonsense flag values
    let threw = false;
    try {
      db.prepare("INSERT INTO Payments (user_id, amount, status, date, is_demo) VALUES (?, 1, 'Paid', '2026-11-02', 2)").run(a.id);
    } catch (e) { threw = true; }
    check('Database rejects an is_demo value other than 0 or 1', threw);

    // Seeded demo member: everything the seed script made must be demo
    r = await call('POST', '/login', { email: 'demo@fitkats.com', password: 'Password123' });
    const demoToken = r.json.token;
    r = await call('GET', '/payments', null, demoToken);
    check('Every seeded payment for the demo member is flagged demo',
      r.status === 200 && r.json.count >= 3 && r.json.data.every((p) => p.is_demo === true));
    check('Seeded payments come with the demo notice', typeof r.json.notice === 'string');
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
