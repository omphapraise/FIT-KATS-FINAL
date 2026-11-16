// Big Kat Stage 1b tests: severity tiers on programme stop, refer and adapt results.
// Needs the API server running (npm run dev in Terminal 1).
require('dotenv').config();
const db = require('./src/db');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
let passed = 0;
let failed = 0;
const createdUsers = [];

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? '  -> ' + extra : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json };
}

async function newMember() {
  const email = `kb1b-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: 'Stage 1b' } });
  if (r.status !== 201) throw new Error('Could not register test member: ' + JSON.stringify(r.json));
  createdUsers.push(r.json.user.id);
  return r.json.token;
}

const BASE_PLAN = { goal: 'muscle_gain', experience: 'beginner', age_band: '18_64', days_per_week: 3, equipment: 'full_gym' };

function hasNumbers(d) {
  const t = d && d.local_emergency_resources ? JSON.stringify(d.local_emergency_resources) : '';
  return t.includes('112') && t.includes('10177');
}

async function main() {
  console.log('\n=== Big Kat Stage 1b tests ===');
  try {
    const h = await fetch(BASE + '/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e) {
    console.log('API is not reachable. Start it first (Terminal 1: npm run dev).');
    process.exit(1);
  }
  const A = await newMember();

  console.log('\nProgramme stop and refer carry a severity tier');
  let r = await call('POST', '/programmes/generate', { token: A, body: Object.assign({}, BASE_PLAN, { limitations: 'chest pain when I run' }) });
  let d = r.json && r.json.data;
  check('chest pain in limitations is a stop', r.status === 200 && d && d.type === 'stop', r.json && JSON.stringify(r.json).slice(0, 160));
  check('chest pain stop has a severity and says stop exercising', d && !!d.severity && d.stop_exercising === true, d && d.severity);
  check('chest pain stop is the emergency tier with the SA numbers', d && d.severity === 'emergency' && hasNumbers(d), d && JSON.stringify({ severity: d.severity, flags: d.flags }));

  r = await call('POST', '/programmes/generate', { token: A, body: Object.assign({}, BASE_PLAN, { age_band: 'under_18' }) });
  d = r.json && r.json.data;
  check('under 18 refer is needs_assessment with no emergency numbers', r.status === 200 && d && d.type === 'refer' && d.severity === 'needs_assessment' && !d.local_emergency_resources, d && d.severity);
  check('under 18 refer does not say stop exercising', d && d.stop_exercising === false, d && d.stop_exercising);

  r = await call('POST', '/programmes/generate', { token: A, body: Object.assign({}, BASE_PLAN, { pregnancy_status: 'pregnant' }) });
  d = r.json && r.json.data;
  check('pregnant refer is needs_assessment with no emergency numbers', r.status === 200 && d && d.type === 'refer' && d.severity === 'needs_assessment' && !d.local_emergency_resources, d && d.severity);

  console.log('\nAdapt stops carry a severity tier');
  r = await call('POST', '/programmes/generate', { token: A, body: BASE_PLAN });
  const saved = r.json && r.json.saved_id;
  check('a plan was saved to adapt', r.status === 201 && !!saved, r.status);

  r = await call('POST', `/programmes/${saved}/adapt`, { token: A, body: { feedback: 'pain' } });
  d = r.json && r.json.data;
  check('pain is needs_assessment, stop, no emergency numbers', r.status === 200 && d && d.type === 'stop' && d.severity === 'needs_assessment' && d.stop_exercising === true && !d.local_emergency_resources, d && JSON.stringify(d).slice(0, 160));

  r = await call('POST', `/programmes/${saved}/adapt`, { token: A, body: { feedback: 'too_easy', note: 'I felt chest pain yesterday' } });
  d = r.json && r.json.data;
  check('chest pain note is emergency, stop, with the SA numbers', r.status === 200 && d && d.type === 'stop' && d.severity === 'emergency' && d.stop_exercising === true && hasNumbers(d), d && JSON.stringify(d).slice(0, 160));

  r = await call('POST', `/programmes/${saved}/adapt`, { token: A, body: { feedback: 'too_hard' } });
  d = r.json && r.json.data;
  check('ordinary advice carries no severity or emergency numbers', r.status === 200 && d && d.type === 'adaptation' && !d.severity && !d.local_emergency_resources, d && d.type);
}

async function cleanup() {
  try {
    for (const id of createdUsers) db.prepare('DELETE FROM Users WHERE id = ?').run(id);
  } catch (e) {
    console.log('Cleanup problem: ' + e.message);
  }
}

main()
  .then(async () => {
    await cleanup();
    console.log(`\nStage 1b knowledge tests: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    await cleanup();
    console.log('Test run crashed:', err.message);
    process.exit(1);
  });