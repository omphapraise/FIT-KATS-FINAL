// Big Kat Stage 2b tests: POST /fitness-ai/ask (exercise questions in the chat).
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
  const email = `kb2b-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: 'Stage 2b' } });
  if (r.status !== 201) throw new Error('Could not register test member: ' + JSON.stringify(r.json));
  createdUsers.push(r.json.user.id);
  return r.json.token;
}

function short(r) {
  return r.json ? JSON.stringify(r.json.data || r.json).slice(0, 200) : r.status;
}

async function main() {
  console.log('\n=== Big Kat Stage 2b tests ===');
  try {
    const h = await fetch(BASE + '/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e) {
    console.log('API is not reachable. Start it first (Terminal 1: npm run dev).');
    process.exit(1);
  }
  const A = await newMember();
  const ask = (message, token) => call('POST', '/fitness-ai/ask', { token: token === undefined ? A : token, body: { message } });

  console.log('\nBasics');
  let r = await ask('how do i bench press', null);
  check('ask needs login', r.status === 401, r.status);
  r = await ask(' ');
  check('blank message is 400', r.status === 400, r.status);
  r = await call('POST', '/fitness-ai/ask', { token: A, body: {} });
  check('missing message is 400', r.status === 400, r.status);

  console.log('\nExercise questions');
  r = await ask('how do i bench press');
  let d = r.json && r.json.data;
  check('"how do i bench press" is an exercise answer for EX-001', r.status === 200 && d && d.type === 'exercise' && d.exercises[0].id === 'EX-001', short(r));
  check('EX-001 is reviewed in the source but not marked verified', d && d.exercises[0].review_status === 'reviewed' && d.exercises[0].verified_guidance === false, d && JSON.stringify(d.exercises[0]).slice(0, 200));
  check('EX-001 carries a guidance label', d && typeof d.exercises[0].guidance_label === 'string' && d.exercises[0].guidance_label.length > 0);

  r = await ask('how do I do a back squat');
  d = r.json && r.json.data;
  check('back squat -> EX-011', r.status === 200 && d && d.type === 'exercise' && d.exercises[0].id === 'EX-011', short(r));

  r = await ask('technique for trap bar deadlift');
  d = r.json && r.json.data;
  check('trap bar deadlift -> EX-S018 as a stub', r.status === 200 && d && d.type === 'exercise' && d.exercises[0].id === 'EX-S018' && d.exercises[0].review_status === 'stub', short(r));
  check('stub carries no technique or safety text', d && d.exercises[0].execution === null && d.exercises[0].safety === null, d && JSON.stringify(d.exercises[0]).slice(0, 200));
  check('stub is not verified guidance', d && d.exercises[0].verified_guidance === false);

  r = await ask('how do i do a close grip bench press');
  d = r.json && r.json.data;
  check('close grip bench is an exercise answer that says it is not in the library', r.status === 200 && d && d.type === 'exercise' && d.resolution.kind === 'variation_not_in_library' && d.exercises.length === 0, short(r));
  check('close grip bench is NOT mapped to EX-001', d && !d.exercises.some((e) => e.id === 'EX-001'), short(r));
  check('close grip bench has a plain message', d && typeof d.message === 'string' && d.message.length > 0);

  r = await ask('how to do a sumo deadlift');
  d = r.json && r.json.data;
  check('sumo deadlift is not mapped to EX-014', r.status === 200 && d && d.type === 'exercise' && d.resolution.kind === 'variation_not_in_library' && !d.exercises.some((e) => e.id === 'EX-014'), short(r));

  console.log('\nEverything else still works as before');
  r = await ask('is creatine safe');
  d = r.json && r.json.data;
  check('"is creatine safe" is still FAQ-016', r.status === 200 && d && d.type === 'faq' && d.primary.id === 'FAQ-016', short(r));
  r = await ask('benchpress');
  d = r.json && r.json.data;
  check('"benchpress" is still FAQ-022 (no exercise phrasing)', r.status === 200 && d && d.type === 'faq' && d.primary.id === 'FAQ-022', short(r));
  r = await ask('what is rpe');
  d = r.json && r.json.data;
  check('"what is rpe" is still FAQ-007', r.status === 200 && d && d.type === 'faq' && d.primary.id === 'FAQ-007', short(r));
  r = await ask('banana helicopter');
  d = r.json && r.json.data;
  check('nonsense still gets no answer', r.status === 200 && d && d.type === 'none', short(r));
  r = await ask('my legs are sore');
  d = r.json && r.json.data;
  check('ordinary soreness is not a safety card', r.status === 200 && d && d.type !== 'safety', short(r));

  console.log('\nSafety still goes first');
  r = await ask('how do i bench press with chest pain');
  d = r.json && r.json.data;
  check('chest pain beats the exercise answer', r.status === 200 && d && d.type === 'safety' && d.severity === 'emergency', short(r));
  const text = d && d.local_emergency_resources ? JSON.stringify(d.local_emergency_resources) : '';
  check('emergency carries the approved SA numbers', text.includes('112') && text.includes('10177'), text);
  r = await ask('sharp pain in my shoulder when i bench press');
  d = r.json && r.json.data;
  check('sharp pain is needs_assessment with no numbers', r.status === 200 && d && d.type === 'safety' && d.severity === 'needs_assessment' && !d.local_emergency_resources, short(r));
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
    console.log(`\nStage 2b knowledge tests: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    await cleanup();
    console.log('Test run crashed:', err.message);
    process.exit(1);
  });