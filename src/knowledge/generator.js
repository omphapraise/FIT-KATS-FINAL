'use strict';

// Big Kat programme generator (pure JS, no dependencies, no database).
// It SELECTS and ADAPTS the closest programme from programmes.json. It never
// invents sets, reps, exercises or technique text. Order follows
// generator_framework: safety gate -> goal -> level -> logistics ->
// preferences -> dose -> progression.
//
// Selection scoring weights and the equipment compatibility table are
// ENGINEERING-DERIVED (the source documents do not specify them).

const loader = require('./loader');
const retrieval = require('./retrieval');

const GOALS = ['muscle_gain', 'strength', 'fat_loss', 'general_fitness', 'endurance', 'sport_performance', 'mobility_function', 'powerlifting'];
const EXPERIENCE = ['beginner', 'intermediate', 'advanced', 'returning'];
const AGE_BANDS = ['under_18', '18_64', '65_plus'];
const EQUIPMENT = ['full_gym', 'barbell', 'home_dumbbells', 'bodyweight', 'bands'];
const PREGNANCY = ['none', 'pregnant', 'postpartum'];
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

// goal -> programme goal tags (tags exist in programmes.json)
const GOAL_TAGS = {
  muscle_gain: ['hypertrophy'],
  strength: ['strength'],
  fat_loss: ['fat_loss_support', 'general_health'],
  general_fitness: ['general_health', 'general_fitness'],
  endurance: ['running_support'],
  sport_performance: [], // decided by `sport`
  mobility_function: ['mobility', 'balance', 'daily_function'],
  powerlifting: ['powerlifting'],
};
const SPORT_TAGS = { football: ['sport_support_football'], soccer: ['sport_support_football'], running: ['running_support'] };

// user equipment -> programme equipment_profile values it can use
const EQUIPMENT_COMPAT = {
  full_gym: ['commercial_gym', 'barbell_gym', 'dumbbells', 'bodyweight', 'not_stated'],
  barbell: ['barbell_gym', 'bodyweight', 'not_stated'],
  home_dumbbells: ['dumbbells', 'bodyweight', 'not_stated'],
  bodyweight: ['bodyweight', 'not_stated'],
  bands: ['bodyweight', 'not_stated'],
};
const EQUIPMENT_EXACT = { full_gym: 'commercial_gym', barbell: 'barbell_gym', home_dumbbells: 'dumbbells', bodyweight: 'bodyweight' };

const PREGNANCY_TEXT = /\b(pregnan\w*|expecting a baby|postpartum|post partum|just (had|given birth)|gave birth)\b/;
const DARK_URINE_TEXT = /\b(dark|brown|cola|tea) (coloured |colored )?(urine|wee|pee)\b/;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
function validateInput(raw) {
  const errors = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  const input = {};

  if (!GOALS.includes(src.goal)) errors.push('goal must be one of: ' + GOALS.join(', '));
  else input.goal = src.goal;

  if (!EXPERIENCE.includes(src.experience)) errors.push('experience must be one of: ' + EXPERIENCE.join(', '));
  else input.experience = src.experience;

  if (!AGE_BANDS.includes(src.age_band)) errors.push('age_band must be one of: ' + AGE_BANDS.join(', '));
  else input.age_band = src.age_band;

  const days = Number(src.days_per_week);
  if (!Number.isInteger(days) || days < 2 || days > 6) errors.push('days_per_week must be a whole number from 2 to 6');
  else input.days_per_week = days;

  if (!EQUIPMENT.includes(src.equipment)) errors.push('equipment must be one of: ' + EQUIPMENT.join(', '));
  else input.equipment = src.equipment;

  if (src.session_minutes == null || src.session_minutes === '') input.session_minutes = null;
  else {
    const m = Number(src.session_minutes);
    if (!Number.isInteger(m) || m < 20 || m > 180) errors.push('session_minutes must be a whole number from 20 to 180');
    else input.session_minutes = m;
  }

  if (src.pregnancy_status == null || src.pregnancy_status === '') input.pregnancy_status = 'none';
  else if (!PREGNANCY.includes(src.pregnancy_status)) errors.push('pregnancy_status must be one of: ' + PREGNANCY.join(', '));
  else input.pregnancy_status = src.pregnancy_status;

  if (src.health_condition != null && typeof src.health_condition !== 'boolean') errors.push('health_condition must be true or false');
  else input.health_condition = src.health_condition === true;

  if (src.limitations == null || src.limitations === '') input.limitations = '';
  else if (typeof src.limitations !== 'string' || src.limitations.trim().length > 300) errors.push('limitations must be text of up to 300 characters');
  else input.limitations = src.limitations.trim();

  if (src.sport == null || src.sport === '') input.sport = '';
  else if (typeof src.sport !== 'string' || src.sport.trim().length > 40) errors.push('sport must be text of up to 40 characters');
  else input.sport = src.sport.trim().toLowerCase();

  input.dislikes = [];
  if (src.dislikes != null) {
    if (!Array.isArray(src.dislikes) || src.dislikes.length > 10) errors.push('dislikes must be a list of up to 10 exercise names');
    else {
      for (const d of src.dislikes) {
        if (typeof d !== 'string' || d.trim().length < 2 || d.trim().length > 40) {
          errors.push('each disliked exercise must be 2 to 40 characters');
          break;
        }
        input.dislikes.push(d.trim().toLowerCase());
      }
    }
  }

  return { errors, input };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function base(type, humour) {
  return { knowledge_version: loader.getVersion(), type, humour_level: humour, trace: [] };
}

function stripCitations(s) {
  return String(s == null ? '' : s).replace(/\s*\[S\d+\]/g, '').trim();
}

function emergencyBlock() {
  const meta = loader.getMeta('safety_responses');
  return {
    local_emergency_resources: meta.local_emergency_resources || null,
    local_emergency_resources_note: meta.local_emergency_resources
      ? null
      : 'No approved South African emergency or clinical contacts are configured yet.',
  };
}

function populationRefer(id, extraTrace) {
  const rec = loader.getRecord('special_populations', id);
  const out = base('refer', 'H0');
  out.reason = id;
  out.special_population = rec
    ? { id: rec.id, population: rec.population, programming_guardrails: rec.programming_guardrails, escalation: stripCitations(rec.escalation), source_ids: rec.source_ids || [] }
    : { id };
  out.message = 'I will not generate a programme for this in the app. ' + (rec ? stripCitations(rec.escalation) : 'Please speak to a qualified professional.');
  out.trace.push({ step: 'step_1_safety_gate', outcome: 'refer', detail: extraTrace || id });
  Object.assign(out, emergencyBlock());
  return out;
}

function stopResult(safetyIds, redFlagId) {
  const out = base('stop', 'H0');
  out.trace.push({ step: 'step_1_safety_gate', outcome: 'stop', detail: (safetyIds || []).concat(redFlagId ? [redFlagId] : []).join(', ') });
  if (safetyIds && safetyIds.length) {
    const rec = loader.getRecord('safety_responses', safetyIds[0]);
    out.safety = {
      id: rec.id,
      trigger: rec.trigger,
      chatbot_action: rec.chatbot_action,
      message: String(rec.example_language || '').replace(/^\s*'+/, '').replace(/'+\s*$/, ''),
    };
    out.flags = safetyIds;
    out.message = out.safety.message;
  } else if (redFlagId) {
    const rf = loader.getRecord('red_flags', redFlagId);
    out.red_flag = { id: redFlagId, text: rf ? rf.text : null };
    out.message = rf ? rf.text : 'Please seek urgent medical care.';
  }
  Object.assign(out, emergencyBlock());
  return out;
}

// ---------------------------------------------------------------------------
// Step 1: safety gate
// ---------------------------------------------------------------------------
function safetyGate(input) {
  if (input.age_band === 'under_18') return populationRefer('adolescents', 'under_18');
  if (input.pregnancy_status === 'pregnant') return populationRefer('pregnancy', 'pregnant');
  if (input.pregnancy_status === 'postpartum') return populationRefer('postpartum', 'postpartum');

  const text = input.limitations || '';
  if (text) {
    const norm = text.toLowerCase();
    if (DARK_URINE_TEXT.test(norm)) return stopResult(null, 'redflag_03');
    const ids = retrieval.detectSafety(text);
    if (ids.includes('SAFE-01') || ids.includes('SAFE-02') || ids.includes('SAFE-03')) {
      return stopResult(ids.filter((i) => i !== 'SAFE-04'));
    }
    if (ids.includes('SAFE-04')) return populationRefer('adolescents', 'SAFE-04 text');
    if (PREGNANCY_TEXT.test(norm)) return populationRefer(/post/.test(norm) ? 'postpartum' : 'pregnancy', 'stated in limitations');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Steps 2-4: goal, level, logistics -> choose a programme
// ---------------------------------------------------------------------------
function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function isOlderProgramme(p) {
  return /older/i.test(p.title || ''); // engineering-derived: P11 is the older-adult programme
}

function goalTagsFor(input) {
  if (input.goal === 'sport_performance') return SPORT_TAGS[input.sport] || [];
  return GOAL_TAGS[input.goal] || [];
}

function selectProgramme(input) {
  const tags = goalTagsFor(input);
  const level = input.experience === 'returning' ? 'beginner' : input.experience;
  const uIdx = LEVEL_ORDER.indexOf(level);
  const compat = EQUIPMENT_COMPAT[input.equipment];
  const excluded = [];
  const eligible = [];

  for (const p of loader.getRecords('programmes')) {
    const why = [];
    if (p.requires_qualified_coach === true) {
      excluded.push({ id: p.id, title: p.title, reason: 'requires a qualified coach' });
      continue;
    }
    const older = isOlderProgramme(p);
    if (input.age_band === '65_plus') {
      if (!older) why.push('not the older-adult programme');
    } else if (older && input.goal !== 'mobility_function') {
      why.push('older-adult programme');
    }
    const pTags = asArray(p.goals);
    const shared = pTags.filter((t) => tags.includes(t));
    if (input.age_band !== '65_plus' && !shared.length) why.push('goal does not match');
    if (input.age_band === '65_plus' && !older) why.push('age band');
    if (!compat.includes(p.equipment_profile || 'not_stated')) why.push('equipment does not match');
    const dayOpts = asArray(p.days_per_week).filter((d) => Number.isFinite(d));
    const minDays = dayOpts.length ? Math.min(...dayOpts) : null;
    if (minDays != null && minDays > input.days_per_week) why.push('needs more days than available');

    let levelBonus = 0;
    let levelFlag = null;
    const lv = asArray(p.levels).map((l) => LEVEL_ORDER.indexOf(l)).filter((i) => i >= 0);
    if (input.age_band !== '65_plus') {
      if (lv.length) {
        if (uIdx < Math.min(...lv)) why.push('above your level');
        else if (uIdx > Math.max(...lv)) {
          levelBonus = -2;
          levelFlag = 'below_level';
        } else levelBonus = 2;
      } else levelFlag = 'level_not_stated';
    }

    if (why.length) {
      excluded.push({ id: p.id, title: p.title, reason: why.join('; ') });
      continue;
    }

    const chosenDays = dayOpts.length ? Math.max(...dayOpts.filter((d) => d <= input.days_per_week)) : null;
    let score = shared.length * 3 + (shared.length && pTags[0] === shared[0] ? 1 : 0) + levelBonus;
    if (chosenDays != null) score += 2 - (input.days_per_week - chosenDays) * 0.5;
    if (EQUIPMENT_EXACT[input.equipment] && p.equipment_profile === EQUIPMENT_EXACT[input.equipment]) score += 3;
    eligible.push({ p, score, chosenDays, levelFlag });
  }

  eligible.sort((a, b) => b.score - a.score || (a.p.id < b.p.id ? -1 : 1));
  return { eligible, excluded };
}

// ---------------------------------------------------------------------------
// Steps 5-7: preferences, dose, progression
// ---------------------------------------------------------------------------
function resolveExercise(id) {
  const rec = loader.getRecord('exercises', id);
  if (!rec) return { id, name: null, status: 'unknown', details_available: false, equipment: null, execution: null, safety: null };
  const hasDetails = !!rec.execution;
  return {
    id: rec.id,
    name: rec.name,
    status: rec.status,
    details_available: hasDetails,
    equipment: rec.equipment || null,
    // technique and safety text only when the source reviewed this exercise
    execution: hasDetails ? rec.execution : null,
    safety: hasDetails ? rec.safety || null : null,
    pending_review: !hasDetails,
  };
}

function isDisliked(name, dislikes) {
  if (!name) return false;
  const n = name.toLowerCase();
  return dislikes.some((d) => n.includes(d) || d.includes(n));
}

// Some programmes are defined in the source as "the routine of another programme"
// (P02: "Full-body resistance routine as P01") and carry no exercises of their own.
// When there is exactly one empty session whose name points at a programme that has
// real sessions, use that programme's sessions. Nothing is invented: the content is
// the referenced programme's own, straight from the source.
function sessionsSource(p) {
  const own = asArray(p.sessions);
  const plain = { sessions: own, dayNames: asArray(p.day_names), from: null };
  if (own.length !== 1 || asArray(own[0].exercises).length) return plain;
  const m = /\bas (P\d{1,3})\b/i.exec(own[0].name || '');
  if (!m) return plain;
  const refId = m[1].toUpperCase();
  if (refId === p.id) return plain;
  const ref = loader.getRecord('programmes', refId);
  if (!ref || !asArray(ref.sessions).some((s) => asArray(s.exercises).length)) return plain;
  return {
    sessions: asArray(ref.sessions),
    dayNames: asArray(ref.day_names).length ? asArray(ref.day_names) : asArray(p.day_names),
    from: ref,
  };
}

function buildSessions(src, input, flags) {
  const dayNames = src.dayNames;
  if (src.from) flags.push('sessions_from_referenced_programme');
  return src.sessions.map((s, i) => {
    const slots = asArray(s.exercises).map((ex) => {
      const all = asArray(ex.exercise_ids).map(resolveExercise);
      let options = all.filter((o) => !isDisliked(o.name, input.dislikes));
      let dislikeNote = null;
      if (all.length && !options.length) {
        options = all;
        dislikeNote = 'Every option for this slot matches something you dislike. Pick the least bad one or ask a coach for a swap.';
        flags.push('dislike_unavoidable');
      } else if (options.length < all.length) {
        dislikeNote = 'Options you dislike were removed.';
      }
      const doseStated = ex.sets_min != null && ex.reps != null;
      return {
        label: ex.label,
        sets_min: ex.sets_min == null ? null : ex.sets_min,
        sets_max: ex.sets_max == null ? null : ex.sets_max,
        reps: ex.reps == null ? null : ex.reps,
        per_side: ex.per_side === true,
        pattern_id: ex.pattern_id || null,
        note: ex.note || null,
        dose_stated: doseStated,
        dose_note: doseStated ? null : 'The source gives no set/rep numbers for this slot.',
        options,
        option_note: dislikeNote,
      };
    });
    return {
      name: s.name,
      day: dayNames.length === 1 ? dayNames[0] : dayNames[i] || null,
      slots,
      list_note: slots.length ? null : 'The source gives no exercise list for this session.',
    };
  });
}

// ---------------------------------------------------------------------------
// Public: generate
// ---------------------------------------------------------------------------
function generate(raw) {
  const { errors, input } = validateInput(raw);
  if (errors.length) return { valid: false, errors };

  const gated = safetyGate(input);
  if (gated) return Object.assign({ valid: true }, gated);

  const trace = [{ step: 'step_1_safety_gate', outcome: 'proceed' }];
  const flags = [];
  const notes = [];

  // Step 2: goal
  if (input.goal === 'powerlifting') {
    const coach = loader.getRecords('programmes').find((p) => p.requires_qualified_coach === true);
    const out = base('coach_required', 'H1');
    out.trace = trace.concat([{ step: 'step_2_goal_classification', outcome: 'powerlifting', detail: 'programme requires a qualified coach' }]);
    out.programme = coach ? { id: coach.id, title: coach.title } : null;
    out.message = 'The powerlifting programme in the knowledge base requires a qualified coach, so it is not assigned automatically.';
    return Object.assign({ valid: true }, out);
  }
  if (input.goal === 'sport_performance' && !goalTagsFor(input).length) {
    const out = base('no_match', 'H1');
    out.trace = trace.concat([{ step: 'step_2_goal_classification', outcome: 'sport_not_covered', detail: input.sport || 'no sport given' }]);
    out.message = input.sport
      ? 'The knowledge base has sport-support programmes for football and running only, so I cannot build one for ' + input.sport + '.'
      : 'Tell me which sport. The knowledge base covers football and running support.';
    return Object.assign({ valid: true }, out);
  }
  trace.push({ step: 'step_2_goal_classification', outcome: input.goal });

  // Step 3: level
  if (input.experience === 'returning') {
    notes.push('Returning after a break: treated as beginner (engineering default, conservative).');
    flags.push('returning_treated_as_beginner');
  }
  trace.push({ step: 'step_3_user_capacity', outcome: input.experience === 'returning' ? 'beginner (returning)' : input.experience });

  // Step 4: logistics
  const { eligible, excluded } = selectProgramme(input);
  if (!eligible.length) {
    const out = base('no_match', 'H1');
    out.trace = trace.concat([{ step: 'step_4_logistics', outcome: 'no_programme', detail: 'nothing fits goal, level, equipment and days' }]);
    out.message = 'None of the programmes in the knowledge base fit that combination of goal, level, equipment and days.';
    out.excluded = excluded;
    return Object.assign({ valid: true }, out);
  }
  const top = eligible[0];
  const p = top.p;
  trace.push({ step: 'step_4_logistics', outcome: p.id, detail: 'days ' + (top.chosenDays == null ? 'n/a' : top.chosenDays) + ' of ' + input.days_per_week });

  if (top.levelFlag === 'below_level') {
    flags.push('programme_below_level');
    notes.push('This programme is written for a lower level than yours; it is the closest match available.');
  }
  if (top.levelFlag === 'level_not_stated') {
    flags.push('programme_level_not_stated');
    notes.push('The source does not state a level for this programme.');
  }
  if (top.chosenDays != null && top.chosenDays < input.days_per_week) {
    notes.push('This programme uses ' + top.chosenDays + ' training days; you have ' + input.days_per_week + ' available.');
  }
  const sm = asArray(p.session_minutes);
  if (input.session_minutes && sm.length && input.session_minutes < Math.min(...sm)) {
    flags.push('shorter_than_planned');
    notes.push('The programme is written for ' + sm.join('-') + ' minute sessions. The source does not say how to shorten it, so ask a coach before cutting exercises.');
  }
  if (input.limitations) {
    notes.push('You mentioned: "' + input.limitations + '". I cannot diagnose or adjust for that; check anything that hurts with a qualified professional.');
    flags.push('limitations_noted');
  }
  if (input.health_condition) {
    const rec = loader.getRecord('special_populations', 'known_health_condition');
    flags.push('known_health_condition');
    notes.push(rec ? rec.programming_guardrails + ' ' + stripCitations(rec.escalation) : 'Check with your treating clinician before starting.');
  }
  if (input.age_band === '65_plus') {
    const rec = loader.getRecord('special_populations', 'older_adults');
    if (rec) notes.push(rec.programming_guardrails + ' ' + stripCitations(rec.escalation));
  }

  // Step 5: preferences + Step 6: dose
  const src = sessionsSource(p);
  const sessions = buildSessions(src, input, flags);
  if (src.from) {
    notes.push('The source defines this programme as the routine of ' + src.from.id + ', so the sessions below are ' + src.from.id + "'s own.");
  }
  trace.push({ step: 'step_5_preferences', outcome: input.dislikes.length ? 'dislikes applied' : 'none given' });
  trace.push({ step: 'step_6_dose', outcome: 'from programme ' + (src.from ? src.from.id + ' (referenced by ' + p.id + ')' : p.id) });
  if (sessions.some((s) => s.slots.some((sl) => sl.options.some((o) => o.pending_review)))) {
    flags.push('exercise_details_pending_review');
    notes.push('Some exercises are named in the source but have no reviewed technique or safety text yet, so none is shown for them.');
  }

  // Step 7: progression
  trace.push({ step: 'step_7_progression', outcome: p.progression_guardrail_text ? 'programme guardrail' : 'none stated' });

  const out = base('plan', 'H1');
  out.trace = trace;
  out.summary = {
    programme_id: p.id,
    title: p.title,
    goal: input.goal,
    level: input.experience,
    days_available: input.days_per_week,
    days_used: top.chosenDays == null ? null : top.chosenDays,
    session_minutes: sm.length ? sm : null,
    programme_weeks: asArray(p.programme_weeks).length ? asArray(p.programme_weeks) : null,
    rest: p.rest || null,
    target_rir: p.target_rir || null,
    effort_note: p.effort_note || null,
  };
  out.sessions = sessions;
  out.progression = {
    text: p.progression_guardrail_text || null,
    note: p.progression_guardrail_text ? null : 'No progression rule is stated for this programme in the source.',
    auto_increase_loads: false,
  };
  out.alternatives = eligible.slice(1, 3).map((e) => ({ id: e.p.id, title: e.p.title }));
  out.notes = notes;
  out.flags = Array.from(new Set(flags));
  out.requires_clinician_confirmation = input.health_condition === true;
  out.disclaimer = 'General fitness information, not medical advice. Stop and seek help for chest pain, fainting, severe breathlessness or sharp, worsening pain.';
  out.provenance = p.provenance || null;
  out.input = input;
  return Object.assign({ valid: true }, out);
}

module.exports = { generate, validateInput, GOALS, EXPERIENCE, AGE_BANDS, EQUIPMENT, PREGNANCY };