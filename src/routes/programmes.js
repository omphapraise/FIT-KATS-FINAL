'use strict';

// Saved programmes: generate (and save), list, read, adapt (advice only), delete.
// Every query is scoped to the logged-in member. Someone else's id returns 404.

const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const loader = require('../knowledge/loader');
const retrieval = require('../knowledge/retrieval');
const generator = require('../knowledge/generator');
const safetyTiers = require('../knowledge/safety_tiers');

const requireAuth = typeof auth === 'function' ? auth : auth.requireAuth;
const router = express.Router();

const MAX_SAVED = 20; // engineering default
const FEEDBACK = ['too_hard', 'too_easy', 'missed_sessions', 'time_short', 'pain'];

function ok(res, status, message, data, extra) {
  return res.status(status).json(Object.assign({ success: true, message, data }, extra || {}));
}

function fail(res, status, message, extra) {
  return res.status(status).json(Object.assign({ success: false, message }, extra || {}));
}

function parseId(value) {
  return /^\d{1,9}$/.test(String(value)) ? Number(value) : null;
}

function findMine(id, userId) {
  return db.prepare('SELECT * FROM SavedProgrammes WHERE id = ? AND user_id = ?').get(id, userId);
}

function stripQuotes(s) {
  return String(s == null ? '' : s).replace(/^\s*'+/, '').replace(/'+\s*$/, '');
}

function stopFromSafety(safetyId, savedId) {
  const rec = loader.getRecord('safety_responses', safetyId);
  const fields = safetyTiers.tierFields([safetyId]);
  fields.stop_exercising = true; // every adapt stop means: do not train yet
  return Object.assign(
    {
      type: 'stop',
      humour_level: 'H0',
      programme_saved_id: savedId,
      safety: {
        id: rec.id,
        trigger: rec.trigger,
        chatbot_action: rec.chatbot_action,
        message: stripQuotes(rec.example_language),
      },
      message: stripQuotes(rec.example_language),
      plan_changed: false,
      knowledge_version: loader.getVersion(),
    },
    fields
  );
}

function buildAdvice(plan, feedback, savedId) {
  const guidance = [];
  const rir = plan.summary && plan.summary.target_rir;
  const progressionText = plan.progression && plan.progression.text;

  if (feedback === 'too_hard') {
    guidance.push({
      text: 'Stay at the lower end of the stated sets' + (rir ? ' and the easier end of the target RIR (' + rir + ')' : '') + '.',
      basis: 'engineering_default',
    });
    if (progressionText) guidance.push({ text: progressionText, basis: 'programme' });
    guidance.push({ text: 'If something hurts rather than just feels hard, tell me and I will switch to the safety flow.', basis: 'design' });
  } else if (feedback === 'too_easy') {
    if (progressionText) guidance.push({ text: progressionText, basis: 'programme' });
    else guidance.push({ text: 'The source states no progression rule for this programme. Ask a qualified coach before adding load.', basis: 'source_gap' });
    guidance.push({ text: 'I never raise loads for you. You decide, based on what you have actually logged.', basis: 'design' });
  } else if (feedback === 'missed_sessions') {
    guidance.push({ text: 'Carry on at the next scheduled session. Do not squeeze the missed sessions in on top of it.', basis: 'engineering_default' });
    guidance.push({ text: 'If you have missed several weeks, generate a new programme with experience set to returning.', basis: 'engineering_default' });
  } else if (feedback === 'time_short') {
    guidance.push({ text: 'The source does not say how to shorten this programme. Ask a qualified coach before cutting exercises.', basis: 'source_gap' });
    const sm = plan.summary && plan.summary.session_minutes;
    if (sm) guidance.push({ text: 'It is written for ' + sm.join('-') + ' minute sessions.', basis: 'programme' });
  }

  return {
    type: 'adaptation',
    humour_level: 'H1',
    programme_saved_id: savedId,
    feedback,
    guidance,
    plan_changed: false,
    auto_increase_loads: false,
    knowledge_version: loader.getVersion(),
  };
}

// POST /programmes/generate   body = assessment (see generator.validateInput)
router.post('/programmes/generate', requireAuth, (req, res) => {
  const result = safetyTiers.decorateProgramme(generator.generate(req.body));
  if (result.valid === false) {
    return fail(res, 400, result.errors[0], { errors: result.errors });
  }

  if (result.type !== 'plan') {
    const messages = {
      stop: 'Please read this before you train',
      refer: 'This needs a qualified professional',
      coach_required: 'This programme needs a qualified coach',
      no_match: 'No programme fits that combination',
    };
    return ok(res, 200, messages[result.type] || 'Done', result, { saved: false, saved_id: null });
  }

  const outcome = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM SavedProgrammes WHERE user_id = ?').get(req.userId).n;
    if (count >= MAX_SAVED) return { full: true };
    const info = db
      .prepare('INSERT INTO SavedProgrammes (user_id, programme_id, title, input_json, plan_json, knowledge_version) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.userId, result.summary.programme_id, result.summary.title, JSON.stringify(result.input), JSON.stringify(result), result.knowledge_version);
    return { id: Number(info.lastInsertRowid) };
  })();

  if (outcome.full) {
    return fail(res, 409, 'You already have ' + MAX_SAVED + ' saved programmes. Delete one first');
  }
  return ok(res, 201, 'Programme saved', result, { saved: true, saved_id: outcome.id });
});

// GET /programmes   (mine, newest first)
router.get('/programmes', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id, programme_id, title, knowledge_version, created_at FROM SavedProgrammes WHERE user_id = ? ORDER BY id DESC')
    .all(req.userId);
  return ok(res, 200, 'Programmes loaded', rows, { count: rows.length });
});

// GET /programmes/:id
router.get('/programmes/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return fail(res, 400, 'Invalid programme id');
  const row = findMine(id, req.userId);
  if (!row) return fail(res, 404, 'Programme not found');
  return ok(res, 200, 'Programme loaded', {
    id: row.id,
    saved_at: row.created_at,
    knowledge_version: row.knowledge_version,
    knowledge_outdated: row.knowledge_version !== loader.getVersion(),
    plan: JSON.parse(row.plan_json),
  });
});

// POST /programmes/:id/adapt   body { feedback, note? }  (advice only, the saved plan is not changed)
router.post('/programmes/:id/adapt', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return fail(res, 400, 'Invalid programme id');
  const row = findMine(id, req.userId);
  if (!row) return fail(res, 404, 'Programme not found');

  const body = req.body || {};
  if (!FEEDBACK.includes(body.feedback)) {
    return fail(res, 400, 'feedback must be one of: ' + FEEDBACK.join(', '));
  }
  let note = '';
  if (body.note != null && body.note !== '') {
    if (typeof body.note !== 'string' || body.note.trim().length > 300) return fail(res, 400, 'note must be text of up to 300 characters');
    note = body.note.trim();
  }

  if (body.feedback === 'pain') return ok(res, 200, 'Please read this before you train', stopFromSafety('SAFE-02', id));
  if (note) {
    const ids = retrieval.detectSafety(note).filter((s) => s !== 'SAFE-04');
    if (ids.length) return ok(res, 200, 'Please read this before you train', stopFromSafety(ids[0], id));
  }

  const plan = JSON.parse(row.plan_json);
  return ok(res, 200, 'Advice ready', buildAdvice(plan, body.feedback, id));
});

// DELETE /programmes/:id
router.delete('/programmes/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return fail(res, 400, 'Invalid programme id');
  const info = db.prepare('DELETE FROM SavedProgrammes WHERE id = ? AND user_id = ?').run(id, req.userId);
  if (!info.changes) return fail(res, 404, 'Programme not found');
  return ok(res, 200, 'Programme deleted', { id });
});

module.exports = router;