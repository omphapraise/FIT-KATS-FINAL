'use strict';

// Big Kat knowledge + chatbot routes. Read-only: nothing here writes to SQLite
// and nothing stores what the member types. All routes require login.

const express = require('express');
const auth = require('../middleware/auth');
const loader = require('../knowledge/loader');
const retrieval = require('../knowledge/retrieval');
const lookup = require('../knowledge/exercise_lookup');
const safetyTiers = require('../knowledge/safety_tiers');

const requireAuth = typeof auth === 'function' ? auth : auth.requireAuth;
const router = express.Router();

// Fail fast at server start if the knowledge files are broken.
loader.load();

// Fail fast if an approved alias no longer points at the right exercise.
const aliasCheck = lookup.verifyAliases();
if (!aliasCheck.ok) {
  throw new Error('Exercise alias check failed: ' + aliasCheck.problems.join('; '));
}

function ok(res, message, data, extra) {
  return res.json(Object.assign({ success: true, message, data }, extra || {}));
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function cleanText(value, min, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length < min || t.length > max) return null;
  return t;
}

function cleanLimit(value, def, max) {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

function buildContext(raw) {
  const ctx = {};
  if (raw && typeof raw === 'object') {
    if (typeof raw.last_faq_id === 'string' && /^FAQ-\d{3}$/.test(raw.last_faq_id)) {
      ctx.last_faq_id = raw.last_faq_id;
    }
    if (typeof raw.level === 'string' && raw.level.trim().length <= 20) {
      ctx.level = raw.level.trim();
    }
  }
  return ctx;
}

// ---- exercise questions (used by POST /fitness-ai/ask) ----
// ENGINEERING-DERIVED: the wording patterns below decide when a message is an
// exercise question. Only the existing alias / variation rules in exercise_lookup
// decide which exercise it is. Fuzzy "search" matches are NOT used here.
const EXERCISE_INTENT = /\b(how (do|can|should) (i|you|we)|how to|technique|form|cues|perform|show me|what is (a|an|the)|what's (a|an|the)|explain)\b/i;
const EXERCISE_KINDS = ['exact', 'alias', 'variation', 'variation_not_in_library'];

function exercisePhrase(message) {
  let t = String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^(please |can you |could you |tell me |show me |explain |teach me )+/, '');
  t = t.replace(/^how (do|can|should) (i|you|we) /, '').replace(/^how to /, '');
  t = t.replace(/^(what is|what's|whats) /, '');
  t = t.replace(/^(the )?(proper |correct )?(technique|form|cues) (for|of|on) /, '');
  t = t.replace(/^(do|perform|doing|performing|learn|set up) /, '');
  t = t.replace(/^(a|an|the|my|proper) /, '');
  t = t.replace(/ (properly|correctly|safely|technique|form|exercise|with good form)$/, '').trim();
  return t;
}

function exerciseView(e) {
  return {
    id: e.id,
    name: e.name,
    status: e.status,
    review_status: e.review_status,
    guidance_label: e.guidance_label,
    verified_guidance: e.verified_guidance === true,
    equipment: e.equipment === undefined ? null : e.equipment,
    execution: e.execution === undefined ? null : e.execution,
    safety: e.safety === undefined ? null : e.safety,
  };
}

// ---------------------------------------------------------------------------
// GET /knowledge
// ---------------------------------------------------------------------------
router.get('/knowledge', requireAuth, (req, res) => {
  const files = loader.listFiles().map((name) => ({ name, records: loader.getRecords(name).length }));
  const records = files.reduce((sum, f) => sum + f.records, 0);
  return ok(res, 'Knowledge base ready', {
    knowledge_version: loader.getVersion(),
    file_count: files.length,
    record_count: records,
    files,
  });
});

// GET /knowledge/categories
router.get('/knowledge/categories', requireAuth, (req, res) => {
  const records = loader.getRecords('intent_categories');
  return ok(res, 'Categories loaded', { knowledge_version: loader.getVersion(), categories: records }, { count: records.length });
});

// GET /knowledge/search?q=
router.get('/knowledge/search', requireAuth, (req, res) => {
  const q = cleanText(req.query.q, 2, 200);
  if (!q) return fail(res, 400, 'Enter a search of 2 to 200 characters');
  const result = retrieval.search(q, { limit: cleanLimit(req.query.limit, 5, 10) });
  return ok(res, 'Search done', result);
});

// GET /knowledge/faqs/:id
router.get('/knowledge/faqs/:id', requireAuth, (req, res) => {
  const id = String(req.params.id || '').toUpperCase();
  if (!/^FAQ-\d{3}$/.test(id)) return fail(res, 400, 'Invalid FAQ id');
  const rec = loader.getRecord('fitness_faq', id);
  if (!rec) return fail(res, 404, 'FAQ not found');
  return ok(res, 'FAQ loaded', { knowledge_version: loader.getVersion(), faq: rec });
});

// GET /knowledge/exercises/search?q=   (must stay above /:id)
// data.resolution says how the query was understood: exact | alias | variation |
// variation_not_in_library | search.
router.get('/knowledge/exercises/search', requireAuth, (req, res) => {
  const q = cleanText(req.query.q, 2, 60);
  if (!q) return fail(res, 400, 'Enter a search of 2 to 60 characters');
  const out = lookup.search(q, 20);
  return ok(
    res,
    'Search done',
    { knowledge_version: loader.getVersion(), resolution: out.resolution, exercises: out.exercises },
    { count: out.exercises.length }
  );
});

// GET /knowledge/exercises/:id
router.get('/knowledge/exercises/:id', requireAuth, (req, res) => {
  const id = String(req.params.id || '').toUpperCase();
  if (!/^EX-S?\d{3}$/.test(id)) return fail(res, 400, 'Invalid exercise id');
  const rec = loader.getRecord('exercises', id);
  if (!rec) return fail(res, 404, 'Exercise not found');
  return ok(res, 'Exercise loaded', { knowledge_version: loader.getVersion(), exercise: lookup.withReview(rec) });
});

// GET /knowledge/programmes
router.get('/knowledge/programmes', requireAuth, (req, res) => {
  const list = loader.getRecords('programmes').map((p) => ({
    id: p.id,
    title: p.title,
    goals: p.goals || [],
    levels: p.levels || [],
    equipment_profile: p.equipment_profile || null,
    days_per_week: p.days_per_week == null ? null : p.days_per_week,
    session_minutes: p.session_minutes || null,
    requires_qualified_coach: p.requires_qualified_coach === true,
  }));
  return ok(res, 'Programmes loaded', { knowledge_version: loader.getVersion(), programmes: list }, { count: list.length });
});

// GET /knowledge/programmes/:id
router.get('/knowledge/programmes/:id', requireAuth, (req, res) => {
  const id = String(req.params.id || '').toUpperCase();
  if (!/^P\d{2}$/.test(id)) return fail(res, 400, 'Invalid programme id');
  const rec = loader.getRecord('programmes', id);
  if (!rec) return fail(res, 404, 'Programme not found');
  return ok(res, 'Programme loaded', { knowledge_version: loader.getVersion(), programme: rec });
});

// POST /fitness-ai/search   body { query, limit? }
router.post('/fitness-ai/search', requireAuth, (req, res) => {
  const body = req.body || {};
  const query = cleanText(body.query, 2, 300);
  if (!query) return fail(res, 400, 'Enter a question of 2 to 300 characters');
  const result = retrieval.search(query, {
    limit: cleanLimit(body.limit, 5, 10),
    context: buildContext(body.context),
  });
  return ok(res, 'Search done', result);
});

// POST /fitness-ai/answer   body { message, context?: { last_faq_id, level } }
// Safety answers carry severity: emergency | needs_assessment.
router.post('/fitness-ai/answer', requireAuth, (req, res) => {
  const body = req.body || {};
  const message = cleanText(body.message, 2, 500);
  if (!message) return fail(res, 400, 'Type a question of 2 to 500 characters');
  const result = safetyTiers.decorate(retrieval.answer(message, { context: buildContext(body.context) }));
  return ok(res, 'Answer ready', result);
});

// POST /fitness-ai/ask   body { message, context? }
// Same as /answer, plus exercise questions. Order: safety first, then exercise
// library (only for exact / alias / variation matches), then the normal FAQ answer.
// data.type: faq | clarification | none | safety | exercise
router.post('/fitness-ai/ask', requireAuth, (req, res) => {
  const body = req.body || {};
  const message = cleanText(body.message, 2, 500);
  if (!message) return fail(res, 400, 'Type a question of 2 to 500 characters');

  const answer = safetyTiers.decorate(retrieval.answer(message, { context: buildContext(body.context) }));
  if (answer.type === 'safety') return ok(res, 'Answer ready', answer);

  if (EXERCISE_INTENT.test(message)) {
    const phrase = exercisePhrase(message);
    if (phrase.length >= 2 && phrase.length <= 60) {
      const out = lookup.search(phrase, 5);
      const kind = out.resolution && out.resolution.kind;
      if (EXERCISE_KINDS.includes(kind)) {
        const exercises = (out.exercises || []).slice(0, 4).map(exerciseView);
        let text;
        if (exercises.length) {
          text = exercises[0].name;
        } else {
          text = (out.resolution && out.resolution.note) || 'That exercise is not in the Big Kat library.';
        }
        return ok(res, 'Answer ready', {
          type: 'exercise',
          knowledge_version: loader.getVersion(),
          message: text,
          resolution: out.resolution,
          exercises,
        });
      }
    }
  }

  return ok(res, 'Answer ready', answer);
});

module.exports = router;