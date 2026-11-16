// Validates backend/knowledge/*.json. Zero dependencies.
// Run from backend:  node scripts/validate-knowledge.js
// Exit code 0 = all checks passed, 1 = at least one error.

const fs = require('fs');
const path = require('path');
const { SCHEMAS, EXPECTED_COUNTS } = require('./knowledge-schemas');

const DEFAULT_DIR = path.join(__dirname, '..', 'knowledge');
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function typeOk(spec, v) {
  if (spec && typeof spec === 'object' && spec.enum) return typeof v === 'string' && spec.enum.includes(v);
  switch (spec) {
    case 'string': return isStr(v);
    case 'string?': return v === null || isStr(v);
    case 'null': return v === null;
    case 'int': return isInt(v);
    case 'bool': return typeof v === 'boolean';
    case 'object': return isObj(v);
    case 'array': return Array.isArray(v);
    case 'string[]': return Array.isArray(v) && v.every(isStr);
    case 'string[]+': return Array.isArray(v) && v.length > 0 && v.every(isStr);
    case 'int|int[]': return isInt(v) || (Array.isArray(v) && v.length > 0 && v.every(isInt));
    case 'int[]?': return v === null || (Array.isArray(v) && v.every(isInt));
    default: return false;
  }
}

function walk(node, fn, trail) {
  fn(node, trail);
  if (Array.isArray(node)) node.forEach((x, i) => walk(x, fn, trail + '[' + i + ']'));
  else if (isObj(node)) Object.keys(node).forEach((k) => walk(node[k], fn, trail + '.' + k));
}

function validateKnowledge(dir = DEFAULT_DIR) {
  const errors = [];
  const warnings = [];
  const checks = [];
  const err = (m) => errors.push(m);
  const check = (name, fn) => {
    const before = errors.length;
    fn();
    checks.push({ name, ok: errors.length === before, errors: errors.length - before });
  };

  const data = {};
  const onDisk = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];

  check('knowledge folder exists and has JSON files', () => {
    if (!onDisk.length) err('No JSON files found in ' + dir);
  });

  check('every file parses as JSON', () => {
    for (const f of onDisk) {
      try { data[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { err(f + ': invalid JSON (' + e.message + ')'); }
    }
  });

  check('every file has a schema, and every schema has a file', () => {
    for (const f of onDisk) if (!SCHEMAS[f]) err(f + ': no schema defined');
    for (const f of Object.keys(SCHEMAS)) if (!onDisk.includes(f)) err(f + ': schema exists but file is missing');
  });

  check('file envelopes (file name, version, source, records array)', () => {
    const versions = new Set();
    for (const f of Object.keys(data)) {
      const d = data[f];
      if (d.file !== f) err(f + ': "file" field is ' + JSON.stringify(d.file));
      if (!isStr(d.knowledge_version)) err(f + ': missing knowledge_version'); else versions.add(d.knowledge_version);
      if (!isStr(d.source_document)) err(f + ': missing source_document');
      if (!isStr(d.source_review_date)) err(f + ': missing source_review_date');
      if (!Array.isArray(d.records) || d.records.length === 0) err(f + ': records must be a non-empty array');
    }
    if (versions.size > 1) err('knowledge_version differs between files: ' + [...versions].join(', '));
  });

  check('top-level extras are present and typed', () => {
    for (const f of Object.keys(data)) {
      const top = (SCHEMAS[f] || {}).top || {};
      for (const k of Object.keys(top)) if (!typeOk(top[k], data[f][k])) err(f + ': top-level "' + k + '" missing or wrong type');
    }
  });

  check('record fields match the schema', () => {
    for (const f of Object.keys(data)) {
      const schema = SCHEMAS[f];
      if (!schema || !Array.isArray(data[f].records)) continue;
      data[f].records.forEach((r, i) => {
        const id = isObj(r) ? r.id : undefined;
        const where = f + ' #' + i + (id ? ' (' + id + ')' : '');
        if (!isObj(r) || !isStr(id)) { err(where + ': record needs a string id'); return; }
        const variant = schema.variants.find((v) => v.idPattern.test(id));
        if (!variant) { err(where + ': id does not match any known record type'); return; }
        for (const [k, spec] of Object.entries(variant.fields)) {
          if (!(k in r)) err(where + ': missing field "' + k + '"');
          else if (!typeOk(spec, r[k])) err(where + ': field "' + k + '" has the wrong type or is empty (' + variant.name + ')');
        }
      });
    }
  });

  check('record ids are unique inside each file', () => {
    for (const f of Object.keys(data)) {
      const seen = new Set();
      for (const r of data[f].records || []) {
        if (!r || !r.id) continue;
        if (seen.has(r.id)) err(f + ': duplicate id ' + r.id);
        seen.add(r.id);
      }
    }
  });

  check('record counts match the source documents', () => {
    for (const [f, n] of Object.entries(EXPECTED_COUNTS)) {
      if (data[f] && data[f].records.length !== n) err(f + ': expected ' + n + ' records, found ' + data[f].records.length);
    }
  });

  const ids = (f, pred) => new Set(((data[f] || {}).records || []).filter(pred || (() => true)).map((r) => r.id));
  const sourceIds = ids('sources.json');
  const exerciseIds = ids('exercises.json');
  const patternIds = ids('movement_patterns.json');

  check('exercise library is EX-001..EX-024 with no gaps', () => {
    for (let i = 1; i <= 24; i++) {
      const id = 'EX-' + String(i).padStart(3, '0');
      if (!exerciseIds.has(id)) err('exercises.json: missing ' + id);
    }
  });

  check('FAQ ids are FAQ-001..FAQ-040 with no gaps', () => {
    const f = ids('fitness_faq.json');
    for (let i = 1; i <= 40; i++) {
      const id = 'FAQ-' + String(i).padStart(3, '0');
      if (!f.has(id)) err('fitness_faq.json: missing ' + id);
    }
  });

  check('exercise records: stubs carry no invented technique text', () => {
    for (const r of (data['exercises.json'] || {}).records || []) {
      if (r.status === 'details_pending_review') {
        for (const k of ['execution', 'safety', 'equipment', 'level']) if (r[k] !== null) err(r.id + ': stub has text in "' + k + '"');
      }
    }
  });

  check('exercise cross references resolve', () => {
    for (const r of (data['exercises.json'] || {}).records || []) {
      if (r.pattern_id && !patternIds.has(r.pattern_id)) err(r.id + ': unknown pattern_id ' + r.pattern_id);
      for (const a of r.alternative_ids || []) if (!exerciseIds.has(a)) err(r.id + ': alternative_id ' + a + ' not found');
      if (r.id === (r.alternative_ids || [])[0] || (r.alternative_ids || []).includes(r.id)) err(r.id + ': lists itself as an alternative');
      for (const b of r.referenced_by || []) {
        if (!exerciseIds.has(b) && !/^P\d{2}$/.test(b)) err(r.id + ': referenced_by ' + b + ' is not an exercise or programme id');
      }
    }
  });

  check('programme cross references resolve', () => {
    const progIds = ids('programmes.json');
    for (const p of (data['programmes.json'] || {}).records || []) {
      for (const s of p.sessions || []) {
        if (s.includes_programme && !progIds.has(s.includes_programme)) err(p.id + ': includes_programme ' + s.includes_programme + ' not found');
        for (const e of s.exercises || []) {
          if (!isStr(e.label)) err(p.id + ': session entry without a label');
          for (const x of e.exercise_ids || []) if (!exerciseIds.has(x)) err(p.id + ': exercise ' + x + ' not found');
          if (e.pattern_id && !patternIds.has(e.pattern_id)) err(p.id + ': unknown pattern_id ' + e.pattern_id);
          if (e.sets_min != null && e.sets_max != null && e.sets_min > e.sets_max) err(p.id + ': sets_min > sets_max in "' + e.label + '"');
        }
      }
    }
  });

  check('every source_ids reference points at a real source', () => {
    for (const f of Object.keys(data)) {
      walk(data[f], (node, trail) => {
        if (isObj(node) && Array.isArray(node.source_ids)) {
          for (const s of node.source_ids) if (!sourceIds.has(s)) err(f + trail + ': unknown source ' + s);
        }
      }, '');
    }
  });

  check('FAQ intents, related topics and humour levels resolve', () => {
    const cats = ids('intent_categories.json');
    const rel = ids('related_concepts.json');
    const faqIds = ids('fitness_faq.json');
    for (const q of (data['fitness_faq.json'] || {}).records || []) {
      if (!cats.has(q.intent_category)) err(q.id + ': unknown intent_category ' + q.intent_category);
      for (const t of q.related_topics || []) if (!rel.has(t)) err(q.id + ': related topic ' + t + ' missing from related_concepts.json');
      if (q.max_humour_level && !/^H[0-3]$/.test(q.max_humour_level)) err(q.id + ': bad max_humour_level');
    }
    for (const c of (data['related_concepts.json'] || {}).records || []) {
      for (const x of c.listed_as_related_by) if (!faqIds.has(x)) err('related_concepts ' + c.id + ': unknown FAQ ' + x);
    }
    const lvl = new Set(((data['humour_personality.json'] || {}).levels || []).map((l) => l.id));
    for (const l of ['H0', 'H1', 'H2', 'H3']) if (!lvl.has(l)) err('humour_personality.json: missing level ' + l);
    for (const s of (data['safety_responses.json'] || {}).records || []) if (!lvl.has(s.humour_level)) err(s.id + ': unknown humour_level');
  });

  check('abbreviations point at real keyword rows', () => {
    const kw = ids('keyword_index.json');
    for (const a of (data['abbreviations.json'] || {}).records || []) if (!kw.has(a.keyword_record)) err(a.id + ': keyword_record ' + a.keyword_record + ' not found');
  });

  check('quarantined keyword rows are not retrievable', () => {
    for (const k of (data['keyword_index.json'] || {}).records || []) {
      if (k.quarantine_reason && k.retrieval_enabled !== false) err(k.id + ': quarantined but retrieval_enabled is not false');
    }
  });

  check('SA emergency resources are complete and state how they were verified', () => {
    const sr = (data['safety_responses.json'] || {}).local_emergency_resources;
    if (!isObj(sr)) { err('safety_responses.json: local_emergency_resources must be an object'); return; }
    if (!isStr(sr.message)) err('local_emergency_resources: missing message');
    else {
      if (!sr.message.includes('112')) err('local_emergency_resources: message does not mention 112');
      if (!sr.message.includes('10177')) err('local_emergency_resources: message does not mention 10177');
    }
    if (!isStr(sr.basis)) err('local_emergency_resources: missing basis');
    if (!isStr(sr.verification_status)) err('local_emergency_resources: missing verification_status');
  });

  check('metadata lists exactly the files on disk', () => {
    const meta = ((data['metadata.json'] || {}).records || [])[0];
    if (!meta) return;
    const listed = new Set(meta.files);
    for (const f of onDisk) if (f !== 'metadata.json' && !listed.has(f)) err('metadata.json does not list ' + f);
    for (const f of listed) if (!onDisk.includes(f)) err('metadata.json lists missing file ' + f);
  });

  check('no broken text (replacement characters, stray tags)', () => {
    for (const f of Object.keys(data)) {
      walk(data[f], (node, trail) => {
        if (typeof node === 'string' && (node.includes('\uFFFD') || /<\/?(p|br|span|b|i)\b/i.test(node))) err(f + trail + ': suspicious characters in text');
      }, '');
    }
  });

  // Warnings (do not fail the run)
  const stubs = ((data['exercises.json'] || {}).records || []).filter((r) => r.status === 'details_pending_review');
  if (stubs.length) warnings.push(stubs.length + ' exercise stub records have no technique or safety text and need reviewed content before they are shown as instructions.');
  const noDoi = ((data['sources.json'] || {}).records || []).filter((s) => !s.doi);
  if (noDoi.length) warnings.push(noDoi.length + ' sources have no DOI in the source documents; none of the 11 sources has been verified by engineering.');
  const unusedIntents = ((data['intent_categories.json'] || {}).records || []).filter((c) => c.faq_count === 0).map((c) => c.id);
  if (unusedIntents.length) warnings.push('Intent categories with no FAQ: ' + unusedIntents.join(', '));
  const meta = ((data['metadata.json'] || {}).records || [])[0];
  const sr = (data['safety_responses.json'] || {}).local_emergency_resources;
  if (isObj(sr)) warnings.push('South African emergency numbers (112, 10177) were web-checked only, not signed off by an official reviewer. Re-verify before any real release.');
  else warnings.push('safety_responses.json has no South African emergency resources.');
  const emptyKw = ((data['safety_responses.json'] || {}).records || []).filter((s) => !s.detection_keywords.length).length;
  if (emptyKw) warnings.push(emptyKw + ' safety triggers have no detection keywords yet (engineering step, not in the source documents).');

  const stats = {};
  for (const f of Object.keys(data)) stats[f] = (data[f].records || []).length;
  return { errors, warnings, checks, stats, fileCount: onDisk.length, version: meta ? meta.knowledge_version : null };
}

module.exports = { validateKnowledge };

if (require.main === module) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;
  const res = validateKnowledge(dir);
  console.log('Knowledge validation: ' + dir);
  for (const c of res.checks) console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.name + (c.ok ? '' : '  (' + c.errors + ' problem' + (c.errors === 1 ? '' : 's') + ')'));
  if (res.errors.length) {
    console.log('\nProblems:');
    res.errors.slice(0, 60).forEach((e) => console.log('  - ' + e));
    if (res.errors.length > 60) console.log('  ... and ' + (res.errors.length - 60) + ' more');
  }
  if (res.warnings.length) {
    console.log('\nWarnings:');
    res.warnings.forEach((w) => console.log('  - ' + w));
  }
  const total = Object.values(res.stats).reduce((a, b) => a + b, 0);
  console.log('\nFiles: ' + res.fileCount + ', records: ' + total + ', knowledge version: ' + res.version);
  console.log('Knowledge validation: ' + res.checks.filter((c) => c.ok).length + ' passed, ' + res.checks.filter((c) => !c.ok).length + ' failed, ' + res.warnings.length + ' warnings');
  process.exit(res.errors.length ? 1 : 0);
}