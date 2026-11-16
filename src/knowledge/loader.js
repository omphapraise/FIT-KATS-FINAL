'use strict';

// Big Kat knowledge loader.
// Reads every JSON file in backend/knowledge once at startup, keeps it
// read-only in memory, and indexes records by id. No retrieval logic here.

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

let loaded = false;
let version = null;
const files = new Map(); // name -> { meta, records, byId }

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function load() {
  if (loaded) return summary();

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    throw new Error('Knowledge folder not found: ' + KNOWLEDGE_DIR);
  }

  const names = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort();

  if (names.length === 0) {
    throw new Error('Knowledge folder has no JSON files: ' + KNOWLEDGE_DIR);
  }

  const versions = new Set();

  for (const fileName of names) {
    const key = fileName.replace(/\.json$/i, '');
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, fileName), 'utf8'));
    } catch (err) {
      throw new Error('Could not parse knowledge file ' + fileName + ': ' + err.message);
    }
    if (!doc || !Array.isArray(doc.records)) {
      throw new Error('Knowledge file ' + fileName + ' has no records array');
    }

    const meta = {};
    for (const k of Object.keys(doc)) {
      if (k !== 'records') meta[k] = doc[k];
    }

    const byId = new Map();
    for (const rec of doc.records) {
      if (rec && typeof rec.id === 'string') byId.set(rec.id, rec);
    }

    if (doc.knowledge_version) versions.add(doc.knowledge_version);
    files.set(key, { meta: deepFreeze(meta), records: deepFreeze(doc.records), byId });
  }

  if (versions.size !== 1) {
    throw new Error('Knowledge files disagree on version: ' + Array.from(versions).join(', '));
  }
  version = Array.from(versions)[0];
  loaded = true;
  return summary();
}

function ensureLoaded() {
  if (!loaded) load();
}

function getFile(name) {
  ensureLoaded();
  const f = files.get(name);
  if (!f) throw new Error('Unknown knowledge file: ' + name);
  return f;
}

function getRecords(name) {
  return getFile(name).records;
}

function getMeta(name) {
  return getFile(name).meta;
}

function getRecord(name, id) {
  return getFile(name).byId.get(id) || null;
}

function listFiles() {
  ensureLoaded();
  return Array.from(files.keys());
}

function getVersion() {
  ensureLoaded();
  return version;
}

function summary() {
  let records = 0;
  for (const f of files.values()) records += f.records.length;
  return { version, files: files.size, records };
}

module.exports = {
  load,
  getFile,
  getRecords,
  getMeta,
  getRecord,
  listFiles,
  getVersion,
  summary,
  KNOWLEDGE_DIR,
};