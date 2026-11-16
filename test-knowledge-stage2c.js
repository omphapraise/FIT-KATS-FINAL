'use strict';

require('dotenv').config();
const db = require('./src/db');

const BASE = process.env.API_URL || 'http://localhost:' + (process.env.PORT || 3000);
let passed = 0;
let failed = 0;
const created = [];

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : ''));
  }
}

async function call(method, path, opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const res = await fetch(BASE + path, { method, headers, body: o.body ? JSON.stringify(o.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json };
}

async function newMember(label) {
  const email = 'stage2c_' + label + '_' + Date.now() + '@test.local';
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: 'Stage2c ' + label } });
  created.push(email);
  return r.json.token;
}

async function main() {
  console.log('\n=== Big Kat Stage 2c tests (programmes defined "as P01") ===\n');
  try {
    await call('GET', '/health');
  } catch (e) {
    console.log('API is not reachable at ' + BASE + '. Start it in Terminal 1 first.');
    process.exit(1);
  }

  const token = await newMember('a');

  console.log('P02 resolves to the P01 routine');
  const r = await call('POST', '/programmes/generate', {
    token,
    body: { goal: 'fat_loss', experience: 'beginner', age_band: '18_64', days_per_week: 3, equipment: 'full_gym' },
  });
  const d = r.json && r.json.data;
  check('plan is created and saved', r.status === 201 && r.json.saved === true, 'status ' + r.status);
  check('it is P02', d && d.summary && d.summary.programme_id === 'P02', d && d.summary && d.summary.programme_id);
  const sessions = (d && d.sessions) || [];
  const slots = sessions.flatMap((s) => s.slots || []);
  check('sessions now carry exercise slots', slots.length > 0, 'slots ' + slots.length);
  check('no session says the source gives no list', sessions.every((s) => !s.list_note));
  check('slots carry exercise options', slots.some((s) => (s.options || []).length > 0));
  check('the plan says it uses P01 sessions', (d.notes || []).some((n) => /P01/.test(n)));
  check('the plan is flagged', (d.flags || []).includes('sessions_from_referenced_programme'));
  check('stub options still carry no technique text', slots.every((s) => (s.options || []).every((o) => !o.pending_review || (o.execution == null && o.safety == null))));
  check('loads are never auto-increased', d.progression && d.progression.auto_increase_loads === false);

  console.log('\nOther programmes are untouched');
  const r2 = await call('POST', '/programmes/generate', {
    token,
    body: { goal: 'muscle_gain', experience: 'intermediate', age_band: '18_64', days_per_week: 4, equipment: 'full_gym' },
  });
  const d2 = r2.json && r2.json.data;
  check('intermediate hypertrophy is still P03', d2 && d2.summary && d2.summary.programme_id === 'P03');
  check('P03 is not flagged as borrowed', d2 && !(d2.flags || []).includes('sessions_from_referenced_programme'));

  try {
    for (const email of created) db.prepare('DELETE FROM Users WHERE email = ?').run(email);
  } catch (e) { /* cleanup is best effort */ }

  console.log('\nStage 2c knowledge tests: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log('Test run crashed:', e);
  process.exit(1);
});