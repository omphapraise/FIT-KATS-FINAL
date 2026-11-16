'use strict';

// Big Kat exercise lookup: alias + variation handling and review status.
// Aliases were approved by the owner (2026-11-11) and are checked against the
// real library at server start (verifyAliases). A variation that is not in the
// library (e.g. sumo deadlift, close-grip bench) is NEVER silently mapped to
// the base lift. Review status is derived from the existing `status` field;
// nothing is "approved" unless a record carries review_status: 'approved'.

const loader = require('./loader');

const REVIEW_STATUSES = ['stub', 'draft', 'reviewed', 'approved'];

const REVIEW_LABELS = {
  stub: 'Name only. Technique details are pending review.',
  draft: 'Draft guidance. Not yet reviewed.',
  reviewed: 'From the Big Kat source document. Not independently signed off.',
  approved: 'Approved guidance.',
};

function reviewStatus(rec) {
  if (rec && REVIEW_STATUSES.includes(rec.review_status)) return rec.review_status;
  if (rec && rec.status === 'reviewed_in_source') return 'reviewed';
  return 'stub';
}

function withReview(rec) {
  const s = reviewStatus(rec);
  return Object.assign({}, rec, {
    review_status: s,
    guidance_label: REVIEW_LABELS[s],
    verified_guidance: s === 'approved',
  });
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function singular(w) {
  if (w.length <= 3) return w;
  if (/sses$/.test(w)) return w.slice(0, -2);
  if (/ss$/.test(w) || /us$/.test(w)) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function toks(s) {
  return norm(s).split(' ').filter(Boolean).map(singular);
}

function queryTokens(q) {
  const n = norm(q)
    .replace(/\bhex bar\b/g, 'trap bar')
    .replace(/\bclosegrip\b/g, 'close grip')
    .replace(/\bbenchpress\b/g, 'bench press')
    .replace(/\bdead lift\b/g, 'deadlift')
    .replace(/\bpull down\b/g, 'pulldown');
  return n.split(' ').filter(Boolean).map(singular);
}

const FILLER = new Set([
  'form', 'technique', 'how', 'to', 'do', 'exercise', 'the', 'a', 'an', 'proper', 'correct', 'my', 'for', 'with', 'and',
]);

// ---------------------------------------------------------------------------
// Approved aliases (owner decision 2026-11-11, subject to ID check)
// expect  = a word the target exercise name must contain (guards against ID drift)
// family  = words that make an exercise a candidate variation of this lift
// siblings= words used to list related variations when the bare alias is used
// ---------------------------------------------------------------------------
const ALIASES = [
  { phrases: ['bench press', 'bench', 'barbell bench press', 'barbell bench', 'flat bench'], id: 'EX-001', expect: 'bench', family: ['bench', 'press'], siblings: ['bench'] },
  { phrases: ['back squat', 'barbell back squat', 'barbell squat', 'squat'], id: 'EX-011', expect: 'back', family: ['squat'], siblings: ['squat'] },
  { phrases: ['deadlift'], id: 'EX-014', expect: 'conventional', family: ['deadlift'], siblings: ['deadlift'] },
  { phrases: ['rdl'], id: 'EX-013', expect: 'romanian', family: ['deadlift'], siblings: [] },
  { phrases: ['pulldown'], id: 'EX-004', expect: 'pulldown', family: ['pulldown'], siblings: ['pulldown'] },
];

const ALIAS_LIST = [];
for (const def of ALIASES) {
  for (const phrase of def.phrases) ALIAS_LIST.push({ phrase, tokens: toks(phrase), def });
}
ALIAS_LIST.sort((a, b) => b.tokens.length - a.tokens.length);

function verifyAliases() {
  const lib = loader.getRecords('exercises');
  const problems = [];
  for (const a of ALIASES) {
    const rec = lib.find((r) => r.id === a.id);
    if (!rec) {
      problems.push(a.phrases[0] + ' -> ' + a.id + ' not found in the exercise library');
    } else if (!toks(rec.name).includes(a.expect)) {
      problems.push(a.phrases[0] + ' -> ' + a.id + ' is "' + rec.name + '", expected a name containing "' + a.expect + '"');
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
function findPhrase(tokens, phrase) {
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let hit = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

function resolve(query) {
  const lib = loader.getRecords('exercises');
  const qt = queryTokens(query);
  if (!qt.length) return { kind: 'search' };

  const key = qt.join(' ');
  const exact = lib.find((r) => toks(r.name).join(' ') === key);
  if (exact) return { kind: 'exact', primary: exact };

  for (const a of ALIAS_LIST) {
    const at = findPhrase(qt, a.tokens);
    if (at < 0) continue;
    const target = lib.find((r) => r.id === a.def.id);
    if (!target) continue;
    const rest = qt.filter((_, i) => i < at || i >= at + a.tokens.length).filter((t) => !FILLER.has(t));

    if (!rest.length) {
      const variations = lib
        .filter((r) => r.id !== target.id && a.def.siblings.some((s) => toks(r.name).includes(s)))
        .slice(0, 6);
      return { kind: 'alias', primary: target, variations, alias: a.phrase };
    }

    const candidates = lib.filter((r) => {
      const nt = toks(r.name);
      return rest.every((t) => nt.includes(t)) && a.def.family.some((f) => nt.includes(f));
    });
    if (candidates.length) return { kind: 'variation', candidates, rest };
    return { kind: 'variation_not_in_library', base: target, rest };
  }
  return { kind: 'search' };
}

// ---------------------------------------------------------------------------
// Fallback text search (same behaviour the route had before)
// ---------------------------------------------------------------------------
function recordMatches(rec, needle) {
  for (const key of Object.keys(rec)) {
    if (key === 'provenance') continue;
    const v = rec[key];
    if (typeof v === 'string' && v.toLowerCase().includes(needle)) return true;
    if (Array.isArray(v) && v.some((x) => typeof x === 'string' && x.toLowerCase().includes(needle))) return true;
  }
  return false;
}

function substringMatches(query) {
  const needle = String(query == null ? '' : query).toLowerCase().trim();
  if (!needle) return [];
  return loader.getRecords('exercises').filter((rec) => recordMatches(rec, needle));
}

function ref(rec) {
  return rec ? { id: rec.id, name: rec.name, review_status: reviewStatus(rec) } : null;
}

function search(query, limit) {
  const max = limit || 20;
  const q = String(query == null ? '' : query).trim();
  const r = resolve(q);
  const resolution = { kind: r.kind, query: q, matched: null, note: null, variations: [], related_base: null };
  let list = [];

  if (r.kind === 'exact' || r.kind === 'alias') {
    list = [r.primary].concat(substringMatches(q).filter((x) => x.id !== r.primary.id));
    resolution.matched = ref(r.primary);
    if (r.kind === 'alias') {
      resolution.variations = r.variations.map(ref);
      resolution.note =
        'Matched "' + r.alias + '" to ' + r.primary.name + ' (' + r.primary.id + ').' +
        (r.variations.length ? ' Other variations are listed. Tell me if you meant a different one.' : '');
    }
  } else if (r.kind === 'variation') {
    list = r.candidates;
    resolution.note =
      'There is no exact "' + q + '" record. These are the closest ' + r.rest.join(' ') + ' records in the library.';
  } else if (r.kind === 'variation_not_in_library') {
    list = [];
    resolution.related_base = ref(r.base);
    resolution.note =
      'There is no "' + q + '" record in the library. I am not treating it as ' + r.base.name +
      ' because they are different exercises.';
  } else {
    const key = toks(q).join(' ');
    const nameHit = (rec) => (key && toks(rec.name).join(' ').includes(key) ? 1 : 0);
    list = substringMatches(q).sort((a, b) => nameHit(b) - nameHit(a));
  }

  return { resolution, exercises: list.slice(0, max).map(withReview) };
}

module.exports = { search, resolve, verifyAliases, reviewStatus, withReview, REVIEW_STATUSES };