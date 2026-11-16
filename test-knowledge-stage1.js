'use strict';

// Stage 1 tests: exercise aliases, variations, review status, safety severity.
// The API server must be running (Terminal 1) while this runs.

require('dotenv').config();
const db = require('./src/db');

const BASE = process.env.API_URL || 'http://localhost:' + (process.env.PORT || 3000);
let passed = 0;
let failed = 0;
const createdEmails = [];

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

async function call(method, path, opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json };
}

async function newMember(label) {
  const email = label + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '@test.local';
  createdEmails.push(email);
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: 'Stage One' } });
  return r.json && r.json.token;
}

function ids(r) {
  return ((r.json && r.json.data && r.json.data.exercises) || []).map((e) => e.id);
}

function resolution(r) {
  return (r.json && r.json.data && r.json.data.resolution) || {};
}

async function search(token, q) {
  return call('GET', '/knowledge/exercises/search?q=' + encodeURIComponent(q), { token });
}

async function answer(token, message) {
  const r = await call('POST', '/fitness-ai/answer', { token, body: { message } });
  return (r.json && r.json.data) || {};
}

async function main() {
  console.log('\n=== Big Kat Stage 1 tests ===\n');

  try {
    await fetch(BASE + '/health');
  } catch (e) {
    console.log('API not reachable at ' + BASE + '. Start the server in Terminal 1 first.');
    process.exit(1);
  }

  try {
    const token = await newMember('stage1');

    console.log('Login required');
    const noAuth = await call('GET', '/knowledge/exercises/search?q=bench');
    check('exercise search needs login', noAuth.status === 401, noAuth.status);

    console.log('\nApproved aliases');
    let r = await search(token, 'bench');
    check('bench -> EX-001 first', ids(r)[0] === 'EX-001', ids(r).slice(0, 3).join(','));
    check('bench is an alias match', resolution(r).kind === 'alias', resolution(r).kind);

    r = await search(token, 'squat');
    check('squat -> EX-011 first', ids(r)[0] === 'EX-011', ids(r).slice(0, 3).join(','));

    r = await search(token, 'deadlift');
    check('deadlift -> EX-014 first', ids(r)[0] === 'EX-014', ids(r).slice(0, 3).join(','));
    const vars = (resolution(r).variations || []).map((v) => v.id);
    check('deadlift lists other variations (EX-013, EX-S018)', vars.includes('EX-013') && vars.includes('EX-S018'), vars.join(','));

    r = await search(token, 'RDL');
    check('RDL -> EX-013 first', ids(r)[0] === 'EX-013', ids(r).slice(0, 3).join(','));

    r = await search(token, 'pulldown');
    check('pulldown -> EX-004 first', ids(r)[0] === 'EX-004', ids(r).slice(0, 3).join(','));

    r = await search(token, 'back squat');
    check('back squat -> EX-011 first', ids(r)[0] === 'EX-011', ids(r).slice(0, 3).join(','));

    console.log('\nVariations are not treated as the base lift');
    r = await search(token, 'incline bench');
    check('incline bench is a variation match', resolution(r).kind === 'variation', resolution(r).kind);
    check('incline bench returns EX-003 (incline dumbbell press)', ids(r).includes('EX-003'), ids(r).join(','));
    check('incline bench does NOT return EX-001', !ids(r).includes('EX-001'), ids(r).join(','));

    r = await search(token, 'close grip bench');
    check('close grip bench is not in the library', resolution(r).kind === 'variation_not_in_library', resolution(r).kind);
    check('close grip bench returns no exercises', ids(r).length === 0, ids(r).join(','));
    check('close grip bench points at EX-001 only as related base', (resolution(r).related_base || {}).id === 'EX-001');

    r = await search(token, 'sumo deadlift');
    check('sumo deadlift is not in the library', resolution(r).kind === 'variation_not_in_library', resolution(r).kind);
    check('sumo deadlift does NOT return EX-014', !ids(r).includes('EX-014'), ids(r).join(','));

    r = await search(token, 'trap bar deadlift');
    check('trap bar deadlift -> EX-S018 exact', ids(r)[0] === 'EX-S018' && resolution(r).kind === 'exact', ids(r)[0]);

    r = await search(token, 'hex bar deadlift');
    check('hex bar deadlift -> EX-S018', ids(r)[0] === 'EX-S018', ids(r)[0]);

    console.log('\nReview status');
    r = await call('GET', '/knowledge/exercises/EX-S018', { token });
    const stub = (r.json && r.json.data && r.json.data.exercise) || {};
    check('stub review_status is stub', stub.review_status === 'stub', stub.review_status);
    check('stub has no technique text', stub.execution == null && stub.safety == null);
    check('stub is not verified guidance', stub.verified_guidance === false);

    r = await call('GET', '/knowledge/exercises/EX-001', { token });
    const rev = (r.json && r.json.data && r.json.data.exercise) || {};
    check('EX-001 review_status is reviewed', rev.review_status === 'reviewed', rev.review_status);
    check('EX-001 is not marked verified', rev.verified_guidance === false);
    check('EX-001 label says source document', typeof rev.guidance_label === 'string' && /source document/i.test(rev.guidance_label), rev.guidance_label);

    r = await search(token, 'plank');
    const plank = ((r.json.data.exercises || [])[0]) || {};
    check('search results carry review_status', plank.review_status === 'reviewed' || plank.review_status === 'stub', plank.review_status);

    console.log('\nSafety severity');
    let a = await answer(token, 'I have chest pain when I train');
    check('chest pain is a safety answer', a.type === 'safety', a.type);
    check('chest pain severity is emergency', a.severity === 'emergency', a.severity);
    check('chest pain says stop exercising', a.stop_exercising === true);
    const res = a.local_emergency_resources;
    const resText = res == null ? '' : JSON.stringify(res);
    check(
      'emergency resources are unset or the approved SA numbers (112 and 10177)',
      res == null || (resText.includes('112') && resText.includes('10177')),
      resText.slice(0, 120)
    );

    a = await answer(token, 'I felt a sharp pain in my knee when I squat');
    check('sharp knee pain is a safety answer', a.type === 'safety', a.type);
    check('sharp knee pain severity is needs_assessment', a.severity === 'needs_assessment', a.severity);
    check('sharp knee pain says stop exercising', a.stop_exercising === true);
    check('sharp knee pain carries no emergency numbers', a.local_emergency_resources == null);

    a = await answer(token, 'I think I have anorexia');
    check('eating disorder is a safety answer', a.type === 'safety', a.type);
    check('eating disorder is needs_assessment, not an ambulance case', a.severity === 'needs_assessment' && a.local_emergency_resources == null, a.severity);

    a = await answer(token, 'my legs are sore after squats');
    check('ordinary soreness does not raise a safety card', a.type !== 'safety', a.type);
  } finally {
    try {
      for (const email of createdEmails) db.prepare('DELETE FROM Users WHERE email = ?').run(email);
    } catch (e) {
      console.log('Cleanup failed: ' + e.message);
    }
  }

  console.log('\nStage 1 knowledge tests: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log('Test run crashed:', e);
  process.exit(1);
});
