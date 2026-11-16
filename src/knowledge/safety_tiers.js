'use strict';

// Safety severity tiers for Big Kat. Owner decision 2026-11-11: the chatbot must
// not treat a life-threatening emergency, an injury needing assessment and
// ordinary exercise discomfort identically.
//
//   emergency            possible medical emergency (SAFE-01). Only this tier
//                        carries the South African emergency numbers.
//   needs_assessment     needs a qualified professional (SAFE-02, 03, 04, red flags,
//                        refer results). No emergency numbers.
//   ordinary_discomfort  normal soreness. Never raises a safety card; it goes
//                        through normal FAQ retrieval.
//
// The mapping of safety ids to tiers is ENGINEERING-DERIVED, not from the source
// documents. Unknown safety ids and red flags default to needs_assessment.
// Red flags (red_flags.json) have not been reviewed for a stronger tier yet.

const loader = require('./loader');

const TIERS = {
  emergency: { label: 'Possible medical emergency', show_emergency_numbers: true },
  needs_assessment: { label: 'Needs assessment by a qualified professional', show_emergency_numbers: false },
  ordinary_discomfort: { label: 'Ordinary exercise discomfort', show_emergency_numbers: false },
};

function severityOf(flags) {
  const ids = Array.isArray(flags) ? flags : [];
  if (ids.includes('SAFE-01')) return 'emergency';
  return 'needs_assessment';
}

function stopExercising(flags, severity) {
  const ids = Array.isArray(flags) ? flags : [];
  return severity === 'emergency' || ids.includes('SAFE-02');
}

function resourcesFor(severity) {
  if (!TIERS[severity] || !TIERS[severity].show_emergency_numbers) {
    return { local_emergency_resources: null, local_emergency_resources_note: null };
  }
  const meta = loader.getMeta('safety_responses');
  return {
    local_emergency_resources: meta.local_emergency_resources || null,
    local_emergency_resources_note: meta.local_emergency_resources
      ? null
      : 'No approved South African emergency contacts are configured.',
  };
}

function tierFields(flags) {
  const severity = severityOf(flags);
  return Object.assign(
    {
      severity,
      severity_label: TIERS[severity].label,
      stop_exercising: stopExercising(flags, severity),
    },
    resourcesFor(severity)
  );
}

// Chatbot answers (type 'safety')
function decorate(result) {
  if (!result || result.type !== 'safety') return result;
  return Object.assign(result, tierFields(result.flags));
}

// Programme generator results (type 'stop' or 'refer')
function decorateProgramme(result) {
  if (!result || result.valid === false) return result;
  if (result.type === 'stop') {
    const fields = tierFields(result.flags || []);
    fields.stop_exercising = true; // every stop result means: do not train yet
    return Object.assign(result, fields);
  }
  if (result.type === 'refer') {
    return Object.assign(
      result,
      { severity: 'needs_assessment', severity_label: TIERS.needs_assessment.label, stop_exercising: false },
      resourcesFor('needs_assessment')
    );
  }
  return result;
}

module.exports = { decorate, decorateProgramme, tierFields, severityOf, TIERS };