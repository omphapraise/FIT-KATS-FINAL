'use strict';

// Big Kat knowledge retrieval (pure JS, no dependencies).
// Safety gate first, then FAQ retrieval: token scoring, synonym/abbreviation
// expansion from keyword_index, typo tolerance, compound-word splitting,
// confidence levels.
// This is lexical retrieval. It is NOT semantic search.

const loader = require('./loader');

// ---------------------------------------------------------------------------
// Engineering defaults (the source documents do not specify these)
// ---------------------------------------------------------------------------
const CONFIDENCE_RULES = {
  basis: 'engineering default, not from the source documents',
  high: { min_coverage: 0.6, min_margin: 0.15, note: 'or an exact question/phrasing match' },
  medium: { min_coverage: 0.4 },
  low: 'everything else: ask one clarification',
  ambiguous_bare_abbreviation: 'capped at medium and the source ambiguity_action is shown',
};

const FIELD_WEIGHTS = {
  keywords: 4,
  question: 3,
  alternative_phrasings: 3,
  intent_label: 1.5,
  related_topics: 1,
  short_answer: 1,
};

const STOPWORDS = new Set(
  ('a an the is are was were be been am i me my mine you your we it its of to in on at for with and or but ' +
    'if so do does did doing can could should would will just about how what whats why when where which who ' +
    'this that these those there than then too very really please tell explain need want get got have has had ' +
    'dont doesnt cant im ive thats hows some any much many more less also').split(' ')
);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function normalise(text) {
  return String(text == null ? '' : text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(w) {
  if (w.length <= 3) return w;
  let s = w;
  if (/(ss|us|is)$/.test(s)) {
    // keep: press, plus, analysis
  } else if (/(sh|ch|x|z)es$/.test(s)) {
    s = s.slice(0, -2);
  } else if (s.endsWith('s')) {
    s = s.slice(0, -1);
  }
  if (s.length > 5 && s.endsWith('ing')) {
    s = s.slice(0, -3);
    if (/([^aeiouls])\1$/.test(s)) s = s.slice(0, -1);
  }
  return s;
}

function tokenise(text) {
  const out = [];
  for (const raw of normalise(text).split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function toArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(toArray);
  if (typeof v === 'string') return v.split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
  return [String(v)];
}

function editDistance(a, b) {
  // optimal string alignment (Levenshtein + adjacent transposition)
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d = [];
  for (let i = 0; i <= al; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

// ---------------------------------------------------------------------------
// Index (built lazily, once)
// ---------------------------------------------------------------------------
let index = null;

function buildIndex() {
  const faqRecords = loader.getRecords('fitness_faq');
  const N = faqRecords.length;
  const df = new Map();
  const faqs = [];

  for (const rec of faqRecords) {
    const fieldTokens = {
      keywords: toArray(rec.keywords).flatMap(tokenise),
      question: tokenise(rec.question),
      alternative_phrasings: toArray(rec.alternative_phrasings).flatMap(tokenise),
      intent_label: tokenise(rec.intent_label),
      related_topics: toArray(rec.related_topics).flatMap(tokenise),
      short_answer: tokenise(rec.short_answer),
    };
    const best = new Map();
    for (const field of Object.keys(fieldTokens)) {
      for (const t of fieldTokens[field]) {
        const w = FIELD_WEIGHTS[field];
        if (!best.has(t) || best.get(t) < w) best.set(t, w);
      }
    }
    for (const t of best.keys()) df.set(t, (df.get(t) || 0) + 1);

    const phrases = [normalise(rec.question)]
      .concat(toArray(rec.alternative_phrasings).map(normalise))
      .filter(Boolean);
    const keywordPhrases = toArray(rec.keywords)
      .map(normalise)
      .filter((p) => p.split(' ').length >= 2);
    const relatedSet = new Set(toArray(rec.related_topics).flatMap(tokenise));

    faqs.push({ rec, best, phrases, keywordPhrases, relatedSet });
  }

  // keyword rows (synonym groups). Quarantined rows (retrieval_enabled false) are skipped.
  const kwRows = [];
  for (const row of loader.getRecords('keyword_index')) {
    if (row.retrieval_enabled === false) continue;
    kwRows.push({
      id: row.id,
      termTokenSets: toArray(row.terms).map(tokenise).filter((t) => t.length),
      rawTerms: toArray(row.terms).map(normalise),
      conceptTokens: Array.from(new Set(toArray(row.canonical_concepts).flatMap(tokenise))),
      ambiguity_action: row.ambiguity_action || null,
    });
  }

  const abbreviations = new Map();
  for (const a of loader.getRecords('abbreviations')) {
    const key = normalise(a.abbreviation);
    if (key) abbreviations.set(key, a);
  }

  const vocab = new Set(df.keys());
  for (const r of kwRows) {
    r.termTokenSets.forEach((set) => set.forEach((t) => vocab.add(t)));
    r.conceptTokens.forEach((t) => vocab.add(t));
  }
  for (const r of loader.getRecords('related_concepts')) tokenise(r.id).forEach((t) => vocab.add(t));

  index = { N, df, faqs, kwRows, abbreviations, vocab, byId: new Map(faqs.map((f) => [f.rec.id, f])) };
  return index;
}

function getIndex() {
  return index || buildIndex();
}

function resetIndex() {
  index = null;
}

function idf(ix, t) {
  const d = ix.df.get(t) || 0;
  return Math.log(1 + ix.N / (d || 0.5));
}

// ---------------------------------------------------------------------------
// Query analysis: compound split + typo correction + synonym/abbreviation expansion
// ---------------------------------------------------------------------------
const HEALTH_CONTEXT = /\b(blood|pressure|hypertension|heart|cholesterol|bpm|pulse|doctor|medication)\b/;

function correctToken(ix, t) {
  if (ix.vocab.has(t) || t.length < 4) return null;
  const maxDist = t.length >= 8 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  let bestDf = -1;
  for (const v of ix.vocab) {
    if (v[0] !== t[0] || Math.abs(v.length - t.length) > maxDist) continue;
    const dist = editDistance(t, v);
    if (dist > maxDist) continue;
    const dfv = ix.df.get(v) || 0;
    if (dist < bestDist || (dist === bestDist && dfv > bestDf)) {
      best = v;
      bestDist = dist;
      bestDf = dfv;
    }
  }
  return best;
}

function splitCompound(ix, s) {
  // "benchpress" -> ["bench", "press"] when both halves are known words
  if (s.length < 6) return null;
  let best = null;
  let bestMin = 0;
  for (let i = 3; i <= s.length - 3; i++) {
    const a = s.slice(0, i);
    const b = s.slice(i);
    if (ix.vocab.has(a) && ix.vocab.has(b)) {
      const m = Math.min(a.length, b.length);
      if (m > bestMin) {
        best = [a, b];
        bestMin = m;
      }
    }
  }
  return best;
}

function analyse(query) {
  const ix = getIndex();
  const norm = normalise(query);
  const rawWords = norm.split(' ').filter(Boolean);
  const corrected = [];
  const original = [];

  for (const w of rawWords) {
    if (!w || STOPWORDS.has(w)) continue;
    const s = stem(w);
    if (!ix.vocab.has(s)) {
      const parts = splitCompound(ix, s);
      if (parts) {
        corrected.push({ from: w, to: parts.join(' ') });
        parts.forEach((t) => original.push({ t, w: 0.9 }));
        continue;
      }
    }
    const fix = correctToken(ix, s);
    if (fix) {
      corrected.push({ from: w, to: fix });
      original.push({ t: fix, w: 0.9 });
    } else {
      original.push({ t: s, w: 1 });
    }
  }

  const present = new Set(original.map((o) => o.t));
  const expanded = [];
  const healthContext = HEALTH_CONTEXT.test(norm);
  let disambiguation = null;
  let ambiguousBare = false;

  for (const [abbr, rec] of ix.abbreviations) {
    if (rec.ambiguous && rawWords.includes(abbr)) {
      disambiguation = rec.ambiguity_action || null;
      // an ambiguous abbreviation with almost no other words is not safe to resolve silently
      if (rawWords.filter((x) => !STOPWORDS.has(x)).length <= 2) ambiguousBare = true;
    }
  }

  for (const row of ix.kwRows) {
    const matched = row.termTokenSets.some((set) => set.every((t) => present.has(t)));
    if (!matched) continue;
    // ambiguous health reading of "bp": do not expand into bench-press terms
    if (healthContext && row.rawTerms.includes('bp') && rawWords.includes('bp')) continue;
    const add = new Set();
    row.termTokenSets.forEach((set) => set.forEach((t) => add.add(t)));
    row.conceptTokens.forEach((t) => add.add(t));
    for (const t of add) {
      if (!present.has(t) && !expanded.some((e) => e.t === t)) expanded.push({ t, w: 0.5 });
    }
  }

  return { norm, original, expanded, corrected, disambiguation, ambiguousBare };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------
function rank(query, options) {
  const ix = getIndex();
  const opts = options || {};
  const analysis = analyse(query);
  const normWords = analysis.norm.split(' ').filter(Boolean);

  let totalOrig = 0;
  analysis.original.forEach((o) => {
    if ((ix.df.get(o.t) || 0) > 0) totalOrig += idf(ix, o.t);
  });
  let totalExp = 0;
  analysis.expanded.forEach((e) => {
    if ((ix.df.get(e.t) || 0) > 0) totalExp += e.w * idf(ix, e.t);
  });

  const lastFaq = opts.context && opts.context.last_faq_id ? ix.byId.get(opts.context.last_faq_id) : null;
  const level = opts.level || (opts.context && opts.context.level) || null;

  const ranked = [];
  for (const f of ix.faqs) {
    let score = 0;
    let mOrig = 0;
    let mExp = 0;

    for (const q of analysis.original) {
      const fw = f.best.get(q.t);
      if (!fw) continue;
      const v = q.w * idf(ix, q.t);
      score += v * fw;
      mOrig += idf(ix, q.t);
    }
    for (const q of analysis.expanded) {
      const fw = f.best.get(q.t);
      if (!fw) continue;
      const v = q.w * idf(ix, q.t);
      score += v * fw;
      mExp += v;
    }

    let coverage;
    if (totalOrig > 0) coverage = Math.min(1, (mOrig + 0.5 * mExp) / totalOrig);
    else coverage = totalExp > 0 ? Math.min(1, mExp / totalExp) : 0;

    let exact = false;
    if (analysis.norm && f.phrases.includes(analysis.norm)) {
      exact = true;
      score += 100;
      coverage = 1;
    } else if (normWords.length >= 3) {
      for (const p of f.phrases) {
        if (p.split(' ').length >= 3 && (analysis.norm.includes(p) || p.includes(analysis.norm))) {
          score += 6;
          coverage = Math.max(coverage, 0.75);
          break;
        }
      }
    }
    for (const kp of f.keywordPhrases) {
      if (analysis.norm.includes(kp)) score += 4;
    }

    if (score > 0) {
      if (lastFaq && lastFaq.rec.id !== f.rec.id) {
        for (const t of lastFaq.relatedSet) {
          if (f.relatedSet.has(t)) {
            score *= 1.15;
            break;
          }
        }
      }
      const levels = toArray(f.rec.levels).map((l) => l.toLowerCase());
      if (level && levels.includes(String(level).toLowerCase())) score *= 1.05;
    }

    if (score > 0) ranked.push({ f, score, coverage, exact });
  }

  ranked.sort((a, b) => b.score - a.score || (a.f.rec.id < b.f.rec.id ? -1 : 1));
  return { analysis, ranked };
}

function confidenceOf(ranked) {
  if (!ranked.length) return 'none';
  const top = ranked[0];
  const second = ranked[1];
  if (top.exact) return 'high';
  const margin = second ? (top.score - second.score) / top.score : 1;
  if (top.coverage >= CONFIDENCE_RULES.high.min_coverage && margin >= CONFIDENCE_RULES.high.min_margin) return 'high';
  if (top.coverage >= CONFIDENCE_RULES.medium.min_coverage) return 'medium';
  return 'low';
}

function shapeFaq(rec) {
  return {
    id: rec.id,
    question: rec.question,
    short_answer: rec.short_answer,
    detailed_explanation: rec.detailed_explanation,
    practical_recommendation: rec.practical_recommendation,
    misconception: rec.misconception || null,
    warning: rec.warning || null,
    source_ids: rec.source_ids || [],
    evidence_labels: rec.evidence_labels || [],
    safety_sensitive: rec.safety_sensitive === true,
    humour_level_cap: rec.safety_sensitive === true ? 'H0' : rec.max_humour_level == null ? null : rec.max_humour_level,
  };
}

function brief(r) {
  return { id: r.f.rec.id, question: r.f.rec.question, score: Math.round(r.score * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Safety gate. Detection patterns are ENGINEERING-DERIVED: the source documents
// give trigger descriptions only (safety_responses.detection_keywords is empty).
// Only SAFE-01..04 are mapped. Any safety record with no pattern is listed by
// safetyCoverage() and is never triggered. Patterns err on the cautious side,
// so "no chest pain" will still trigger SAFE-01.
// ---------------------------------------------------------------------------
const SAFETY_PATTERNS = {
  'SAFE-01': [
    /\bchest (pain|pains|pressure|tightness|tight|discomfort)\b/,
    /\bpain in (my |the )?chest\b/,
    /\bfaint(ed|ing)?\b/,
    /\bpass(ed)? out\b/,
    /\bblack(ed)? out\b/,
    /\bcollaps(e|ed|ing)\b/,
    /\b(cant|cannot|can not) breathe\b/,
    /\bstruggling to breathe\b/,
    /\b(severe|extreme|crushing|unusual) (breathlessness|shortness of breath|short of breath)\b/,
    /\b(having|had|signs? of|symptoms? of) (a )?stroke\b/,
    /\bface (is )?droop\w*\b/,
    /\bslurred speech\b/,
    /\bheart attack\b/,
  ],
  'SAFE-02': [
    /\b(sharp|stabbing|shooting|searing|severe|worsening|unusual) pains?\b/,
    /\bpain (is )?(getting|gets) (worse|worst)\b/,
    /\bpain (shooting|radiating)\b/,
    /\bsomething (popped|snapped|tore)\b/,
    /\b(popped|snapped|tore|torn|ripped) (in |on )?(my )?(knee|shoulder|back|hamstring|elbow|ankle|hip|muscle|groin|quad|bicep|tricep|calf)\b/,
  ],
  'SAFE-03': [
    /\b(anorexia|anorexic|bulimia|bulimic|eating disorder)\b/,
    /\b(purge|purging|purged)\b/,
    /\bmake myself (sick|throw up|vomit)\b/,
    /\bstarv(e|ing) myself\b/,
    /\blaxatives?\b/,
    /\beat (only |just )?(under |less than )?[1-9]\d{2} (cal|calories|kcal)\b/,
  ],
};

const MINOR_PATTERNS = [
  /\b(i am|im|i m) (1[0-7])\b/,
  /\b(1[0-7]) (year old|years old|yr old|yrs old|yo)\b/,
  /\bgrade (8|9|10|11)\b/,
  /\b(high school|highschool|under 18|underage)\b/,
  /\bim a (teen|teenager|minor|kid)\b/,
];
const WEIGHT_OR_SUPP = /\b(lose weight|weight loss|fat loss|lose fat|diet|dieting|cut weight|fat burners?|diet pills?|supplements?|pre workout|creatine|protein powder|steroids?|sarms?|shred)\b/;

const SAFETY_PRIORITY = ['SAFE-01', 'SAFE-04', 'SAFE-03', 'SAFE-02'];

function detectSafety(query) {
  const norm = normalise(query);
  const hits = [];
  for (const id of Object.keys(SAFETY_PATTERNS)) {
    if (SAFETY_PATTERNS[id].some((re) => re.test(norm))) hits.push(id);
  }
  if (MINOR_PATTERNS.some((re) => re.test(norm)) && WEIGHT_OR_SUPP.test(norm)) hits.push('SAFE-04');
  const unique = Array.from(new Set(hits));
  unique.sort((a, b) => SAFETY_PRIORITY.indexOf(a) - SAFETY_PRIORITY.indexOf(b));
  return unique;
}

function safetyCoverage() {
  const ids = loader.getRecords('safety_responses').map((r) => r.id);
  const mapped = ids.filter((id) => SAFETY_PATTERNS[id] || id === 'SAFE-04');
  return { mapped, unmapped: ids.filter((id) => !mapped.includes(id)) };
}

function stripQuotes(s) {
  return String(s == null ? '' : s).replace(/^\s*'+/, '').replace(/'+\s*$/, '');
}

function safetyAnswer(ids) {
  const rec = loader.getRecord('safety_responses', ids[0]);
  const meta = loader.getMeta('safety_responses');
  return {
    type: 'safety',
    confidence: 'high',
    humour_level: 'H0',
    primary: {
      id: rec.id,
      trigger: rec.trigger,
      chatbot_action: rec.chatbot_action,
      message: stripQuotes(rec.example_language),
    },
    flags: ids,
    related: [],
    local_emergency_resources: meta.local_emergency_resources || null,
    local_emergency_resources_note: meta.local_emergency_resources
      ? null
      : 'No approved South African emergency or clinical contacts are configured yet.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function search(query, options) {
  const limit = (options && options.limit) || 5;
  const { analysis, ranked } = rank(query, options);
  return {
    knowledge_version: loader.getVersion(),
    query,
    corrected: analysis.corrected,
    results: ranked.slice(0, limit).map((r) => Object.assign(brief(r), { coverage: Math.round(r.coverage * 100) / 100 })),
  };
}

function answer(query, options) {
  const version = loader.getVersion();
  const q = String(query == null ? '' : query).trim();
  if (!q) {
    return { type: 'none', confidence: 'none', message: 'Ask me a fitness question.', related: [], knowledge_version: version };
  }

  const safety = detectSafety(q);
  if (safety.length) {
    return Object.assign(safetyAnswer(safety), { knowledge_version: version });
  }

  const { analysis, ranked } = rank(q, options);
  let confidence = confidenceOf(ranked);
  if (analysis.ambiguousBare && confidence === 'high') confidence = 'medium';
  const matched = { corrected: analysis.corrected, expanded: analysis.expanded.map((e) => e.t) };

  if (confidence === 'none') {
    return {
      type: 'none',
      confidence,
      message: "I couldn't find that in my fitness knowledge. Try rephrasing it, or give me a few more details.",
      disambiguation: analysis.disambiguation,
      matched,
      related: [],
      knowledge_version: version,
    };
  }

  if (confidence === 'low') {
    return {
      type: 'clarification',
      confidence,
      message: 'I want to get this right. Did you mean one of these?',
      options: ranked.slice(0, 3).map(brief),
      disambiguation: analysis.disambiguation,
      matched,
      related: [],
      knowledge_version: version,
    };
  }

  const top = ranked[0];
  const related = [];
  const seen = new Set([top.f.rec.id]);
  for (const r of ranked.slice(1)) {
    if (related.length >= 3) break;
    if (r.coverage >= 0.25 && !seen.has(r.f.rec.id)) {
      related.push(brief(r));
      seen.add(r.f.rec.id);
    }
  }
  if (related.length < 3) {
    for (const f of getIndex().faqs) {
      if (related.length >= 3) break;
      if (seen.has(f.rec.id)) continue;
      for (const t of top.f.relatedSet) {
        if (f.relatedSet.has(t)) {
          related.push({ id: f.rec.id, question: f.rec.question, score: 0 });
          seen.add(f.rec.id);
          break;
        }
      }
    }
  }

  return {
    type: 'faq',
    confidence,
    note:
      confidence === 'medium'
        ? analysis.disambiguation || "Closest match I found. Tell me if that isn't what you meant."
        : null,
    disambiguation: analysis.disambiguation,
    primary: shapeFaq(top.f.rec),
    related,
    matched,
    knowledge_version: version,
  };
}

module.exports = {
  answer,
  search,
  analyse,
  detectSafety,
  safetyCoverage,
  resetIndex,
  CONFIDENCE_RULES,
};