// Big Kat knowledge, chatbot and programme tests.
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

async function newMember(label) {
  const email = `kb-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: `KB ${label}` } });
  if (r.status !== 201) throw new Error('Could not register test member: ' + JSON.stringify(r.json));
  createdUsers.push(r.json.user.id);
  return { id: r.json.user.id, token: r.json.token };
}

const BASE_PLAN = { goal: 'muscle_gain', experience: 'beginner', age_band: '18_64', days_per_week: 3, equipment: 'full_gym' };

async function main() {
  console.log('Big Kat knowledge tests against ' + BASE);

  try {
    const h = await fetch(BASE + '/health');
    if (!h.ok) throw new Error('health ' + h.status);
  } catch (e) {
    console.log('API is not reachable. Start it first (Terminal 1: npm run dev).');
    process.exit(1);
  }

  const a = await newMember('a');
  const b = await newMember('b');
  const A = a.token;
  const B = b.token;

  // ---- login required ----
  console.log('\nLogin required');
  for (const [m, p, body] of [
    ['GET', '/knowledge'],
    ['GET', '/knowledge/faqs/FAQ-001'],
    ['POST', '/fitness-ai/answer', { message: 'hello there' }],
    ['GET', '/programmes'],
    ['POST', '/programmes/generate', BASE_PLAN],
  ]) {
    const r = await call(m, p, { body });
    check(`${m} ${p} without token is 401`, r.status === 401, r.status);
  }

  // ---- knowledge base ----
  console.log('\nKnowledge base');
  let r = await call('GET', '/knowledge', { token: A });
  check('GET /knowledge 200', r.status === 200, r.status);
  check('37 files, 467 records, version 1.0.0', r.json && r.json.data.file_count === 37 && r.json.data.record_count === 467 && r.json.data.knowledge_version === '1.0.0', r.json && JSON.stringify(r.json.data).slice(0, 120));
  r = await call('GET', '/knowledge/categories', { token: A });
  check('categories listed', r.status === 200 && r.json.count >= 8, r.status);
  r = await call('GET', '/knowledge/faqs/FAQ-016', { token: A });
  check('FAQ-016 found', r.status === 200 && r.json.data.faq.id === 'FAQ-016', r.status);
  r = await call('GET', '/knowledge/faqs/FAQ-999', { token: A });
  check('FAQ-999 is 404', r.status === 404, r.status);
  r = await call('GET', '/knowledge/faqs/nope', { token: A });
  check('bad FAQ id is 400', r.status === 400, r.status);
  r = await call('GET', '/knowledge/exercises/EX-001', { token: A });
  check('EX-001 is Barbell bench press', r.status === 200 && r.json.data.exercise.name === 'Barbell bench press', r.status);
  r = await call('GET', '/knowledge/exercises/EX-S001', { token: A });
  check('stub EX-S001 has no technique text', r.status === 200 && r.json.data.exercise.execution === null && r.json.data.exercise.safety === null, r.status);
  r = await call('GET', '/knowledge/exercises/EX-999', { token: A });
  check('EX-999 is 404', r.status === 404, r.status);
  r = await call('GET', '/knowledge/exercises/abc', { token: A });
  check('bad exercise id is 400', r.status === 400, r.status);
  r = await call('GET', '/knowledge/exercises/search?q=bench', { token: A });
  check('exercise search finds bench', r.status === 200 && r.json.count >= 1, r.status);
  r = await call('GET', '/knowledge/exercises/search?q=a', { token: A });
  check('exercise search too short is 400', r.status === 400, r.status);
  r = await call('GET', '/knowledge/search?q=creatine', { token: A });
  check('knowledge search ranks FAQ-016 first', r.status === 200 && r.json.data.results[0].id === 'FAQ-016', r.status);
  r = await call('GET', '/knowledge/programmes', { token: A });
  check('11 programmes listed', r.status === 200 && r.json.count === 11, r.json && r.json.count);
  check('P06 requires a qualified coach', r.json && r.json.data.programmes.find((p) => p.id === 'P06').requires_qualified_coach === true);
  r = await call('GET', '/knowledge/programmes/P01', { token: A });
  check('P01 detail loads', r.status === 200 && r.json.data.programme.id === 'P01', r.status);
  r = await call('GET', '/knowledge/programmes/P99', { token: A });
  check('P99 is 404', r.status === 404, r.status);

  // ---- chatbot: keyword + natural language + typos ----
  console.log('\nChatbot answers');
  const answers = [
    ['is creatine safe', 'faq', 'FAQ-016'],
    ['creatien', 'faq', 'FAQ-016'],
    ['benchpress', 'faq', 'FAQ-022'],
    ['my bench stopped moving', 'faq', 'FAQ-022'],
    ['what is rpe', 'faq', 'FAQ-007'],
    ['ppl split', 'faq', 'FAQ-011'],
    ['how many sets for biceps', 'faq', 'FAQ-004'],
  ];
  for (const [q, type, id] of answers) {
    r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: q } });
    check(`"${q}" -> ${id}`, r.status === 200 && r.json.data.type === type && r.json.data.primary.id === id, r.json && JSON.stringify(r.json.data).slice(0, 140));
  }
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'bp' } });
  check('bare "bp" is capped at medium with the ambiguity note', r.status === 200 && r.json.data.confidence === 'medium' && /blood pressure/i.test(r.json.data.note || ''), r.json && JSON.stringify(r.json.data).slice(0, 140));
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'banana helicopter' } });
  check('nonsense gets no answer', r.status === 200 && r.json.data.type === 'none', r.json && r.json.data.type);
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'is creatine safe', context: { last_faq_id: 'FAQ-016', level: 'beginner' } } });
  check('context accepted', r.status === 200 && r.json.data.primary.id === 'FAQ-016', r.status);
  r = await call('POST', '/fitness-ai/search', { token: A, body: { query: 'creatine' } });
  check('fitness-ai search works', r.status === 200 && r.json.data.results.length >= 1, r.status);
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: ' ' } });
  check('blank message is 400', r.status === 400, r.status);
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'x'.repeat(501) } });
  check('501 characters is 400', r.status === 400, r.status);
  r = await call('POST', '/fitness-ai/answer', { token: A, body: {} });
  check('missing message is 400', r.status === 400, r.status);

  // ---- chatbot: safety first ----
  console.log('\nChatbot safety');
  const safety = [
    ['chest pain when running', 'SAFE-01'],
    ['i feel faint', 'SAFE-01'],
    ['sharp pain in my shoulder', 'SAFE-02'],
    ['i am 15 how do i lose weight fast', 'SAFE-04'],
    ['im 16 and want to lose weight', 'SAFE-04'],
  ];
  for (const [q, id] of safety) {
    r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: q } });
    check(`"${q}" -> ${id} at H0`, r.status === 200 && r.json.data.type === 'safety' && r.json.data.primary.id === id && r.json.data.humour_level === 'H0', r.json && JSON.stringify(r.json.data).slice(0, 140));
  }

  // Severity tiers: only the emergency tier carries the approved SA numbers.
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'chest pain when running' } });
  const em = r.json && r.json.data;
  const emText = em && em.local_emergency_resources ? JSON.stringify(em.local_emergency_resources) : '';
  check('emergency tier carries the approved SA numbers (112, 10177)', !!em && em.severity === 'emergency' && em.stop_exercising === true && emText.includes('112') && emText.includes('10177'), em && JSON.stringify(em).slice(0, 200));
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'sharp pain in my shoulder' } });
  const na = r.json && r.json.data;
  check('needs_assessment tier carries no emergency numbers', !!na && na.severity === 'needs_assessment' && !na.local_emergency_resources, na && JSON.stringify(na).slice(0, 200));
  r = await call('POST', '/fitness-ai/answer', { token: A, body: { message: 'my legs are sore two days after leg day' } });
  check('ordinary soreness does not trigger a safety stop', r.status === 200 && r.json.data.type !== 'safety', r.json && JSON.stringify(r.json.data).slice(0, 160));

  // ---- generator personas ----
  console.log('\nProgramme generator personas');
  const personas = [
    ['beginner muscle, full gym, 3 days', {}, 'plan', 'P01'],
    ['intermediate hypertrophy, 4 days', { experience: 'intermediate', days_per_week: 4 }, 'plan', 'P03'],
    ['beginner general fitness, home dumbbells', { goal: 'general_fitness', equipment: 'home_dumbbells' }, 'plan', 'P09'],
    ['65+ mobility, bodyweight', { age_band: '65_plus', goal: 'mobility_function', equipment: 'bodyweight' }, 'plan', 'P11'],
    ['football support', { goal: 'sport_performance', sport: 'football', equipment: 'bodyweight' }, 'plan', 'P07'],
    ['endurance, 2 days, bodyweight', { goal: 'endurance', equipment: 'bodyweight', days_per_week: 2 }, 'plan', 'P08'],
    ['under 18', { age_band: 'under_18' }, 'refer', null],
    ['pregnant', { pregnancy_status: 'pregnant' }, 'refer', null],
    ['postpartum', { pregnancy_status: 'postpartum' }, 'refer', null],
    ['chest pain in limitations', { limitations: 'chest pain when I run' }, 'stop', null],
    ['powerlifting needs a coach', { goal: 'powerlifting', experience: 'intermediate', equipment: 'barbell', days_per_week: 4 }, 'coach_required', null],
    ['sport without a sport named', { goal: 'sport_performance' }, 'no_match', null],
  ];
  let expectedSaved = 0;
  for (const [label, override, type, programme] of personas) {
    r = await call('POST', '/programmes/generate', { token: A, body: Object.assign({}, BASE_PLAN, override) });
    const d = r.json && r.json.data;
    const good = r.status === (type === 'plan' ? 201 : 200) && d && d.type === type && (!programme || d.summary.programme_id === programme) && r.json.saved === (type === 'plan');
    check(`${label} -> ${type}${programme ? ' ' + programme : ''}`, good, r.json && JSON.stringify(r.json).slice(0, 160));
    if (type === 'plan') expectedSaved++;
    if (type === 'stop' || type === 'refer') check(`${label} is delivered at H0`, d && d.humour_level === 'H0');
  }
  r = await call('POST', '/programmes/generate', { token: A, body: { goal: 'nope' } });
  check('invalid assessment is 400 with errors', r.status === 400 && Array.isArray(r.json.errors) && r.json.errors.length > 1, r.status);
  r = await call('POST', '/programmes/generate', { token: A, body: Object.assign({}, BASE_PLAN, { gender: 'female' }) });
  check('gender is ignored and not stored', r.status === 201 && !('gender' in r.json.data.input), r.status);
  expectedSaved++;

  // ---- saved programmes, safety rules on stored plans ----
  console.log('\nSaved programmes');
  r = await call('GET', '/programmes', { token: A });
  check(`A has exactly ${expectedSaved} saved (only plans are saved)`, r.status === 200 && r.json.count === expectedSaved, r.json && r.json.count);
  const firstId = r.json.data[r.json.data.length - 1].id; // oldest = the P01 one
  r = await call('GET', '/programmes/' + firstId, { token: A });
  check('A reads own plan', r.status === 200 && r.json.data.plan.type === 'plan' && r.json.data.knowledge_outdated === false, r.status);
  let stubsOk = true;
  let stubsSeen = 0;
  for (const s of r.json.data.plan.sessions) {
    for (const slot of s.slots) {
      for (const o of slot.options) {
        if (o.pending_review) {
          stubsSeen++;
          if (o.execution !== null || o.safety !== null) stubsOk = false;
        }
      }
    }
  }
  check('stub exercises carry no technique or safety text', stubsSeen > 0 && stubsOk, stubsSeen);
  check('loads are never auto-increased', r.json.data.plan.progression.auto_increase_loads === false);

  // ---- adapt ----
  console.log('\nAdapt');
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'too_hard' } });
  check('too_hard gives advice, plan unchanged', r.status === 200 && r.json.data.type === 'adaptation' && r.json.data.plan_changed === false && r.json.data.auto_increase_loads === false && r.json.data.guidance.length >= 2, r.json && JSON.stringify(r.json.data).slice(0, 140));
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'too_easy' } });
  check('too_easy quotes the programme rule', r.status === 200 && r.json.data.guidance[0].basis === 'programme', r.json && JSON.stringify(r.json.data).slice(0, 140));
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'time_short' } });
  check('time_short admits the source gap', r.status === 200 && r.json.data.guidance[0].basis === 'source_gap', r.status);
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'missed_sessions' } });
  check('missed_sessions gives advice', r.status === 200 && r.json.data.type === 'adaptation', r.status);
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'pain' } });
  check('pain switches to the safety stop at H0', r.status === 200 && r.json.data.type === 'stop' && r.json.data.safety.id === 'SAFE-02' && r.json.data.humour_level === 'H0', r.json && JSON.stringify(r.json.data).slice(0, 140));
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'too_easy', note: 'I felt chest pain yesterday' } });
  check('red-flag note switches to the safety stop', r.status === 200 && r.json.data.type === 'stop' && r.json.data.safety.id === 'SAFE-01', r.json && JSON.stringify(r.json.data).slice(0, 140));
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: A, body: { feedback: 'nope' } });
  check('unknown feedback is 400', r.status === 400, r.status);
  r = await call('POST', '/programmes/abc/adapt', { token: A, body: { feedback: 'too_hard' } });
  check('bad programme id is 400', r.status === 400, r.status);

  // ---- member separation ----
  console.log('\nUser data separation');
  r = await call('GET', '/programmes', { token: B });
  check('B sees none of A\'s programmes', r.status === 200 && r.json.count === 0, r.json && r.json.count);
  r = await call('GET', '/programmes/' + firstId, { token: B });
  check('B reading A\'s plan is 404', r.status === 404, r.status);
  r = await call('POST', `/programmes/${firstId}/adapt`, { token: B, body: { feedback: 'too_hard' } });
  check('B adapting A\'s plan is 404', r.status === 404, r.status);
  r = await call('DELETE', '/programmes/' + firstId, { token: B });
  check('B deleting A\'s plan is 404', r.status === 404, r.status);
  r = await call('GET', '/programmes/' + firstId, { token: A });
  check('A\'s plan survived B\'s attempts', r.status === 200, r.status);

  // ---- cap and delete ----
  console.log('\nCap and delete');
  const have = db.prepare('SELECT COUNT(*) AS n FROM SavedProgrammes WHERE user_id = ?').get(a.id).n;
  const ins = db.prepare("INSERT INTO SavedProgrammes (user_id, programme_id, title, input_json, plan_json, knowledge_version) VALUES (?, 'P01', 'filler', '{}', '{}', '1.0.0')");
  for (let i = have; i < 20; i++) ins.run(a.id);
  r = await call('POST', '/programmes/generate', { token: A, body: BASE_PLAN });
  check('21st saved programme is refused with 409', r.status === 409, r.status);
  r = await call('DELETE', '/programmes/' + firstId, { token: A });
  check('A deletes own plan', r.status === 200, r.status);
  r = await call('DELETE', '/programmes/' + firstId, { token: A });
  check('deleting twice is 404', r.status === 404, r.status);
  r = await call('POST', '/programmes/generate', { token: A, body: BASE_PLAN });
  check('saving works again after a delete', r.status === 201, r.status);
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
    console.log(`\nKnowledge tests: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    await cleanup();
    console.log('Test run crashed:', err.message);
    process.exit(1);
  });