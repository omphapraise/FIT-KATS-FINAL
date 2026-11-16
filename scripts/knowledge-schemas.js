// Big Kat knowledge base: file schemas (zero dependencies).
//
// Type notes used below:
//   'string'     non-empty string          'string?'  non-empty string or null
//   'string[]'   array of non-empty strings (may be empty)
//   'string[]+'  array of non-empty strings (at least one)
//   'int'        whole number              'bool'     true/false
//   'object'     plain object              'array'    any array
//   'int|int[]'  whole number or array of whole numbers
//   'int[]?'     array of whole numbers or null
//   { enum: [...] }  one of the listed strings
//
// Each file has one or more "variants". A record is checked against the first
// variant whose idPattern matches its id. Fields not listed are allowed (the
// data keeps optional audit fields), but listed fields must exist and be typed.

const PROV = { provenance: 'object' };
const SRC = { source_ids: 'string[]' };

const SCHEMAS = {
  'exercises.json': {
    variants: [
      {
        name: 'library exercise', idPattern: /^EX-\d{3}$/,
        fields: {
          id: 'string', name: 'string', status: { enum: ['reviewed_in_source'] },
          movement_pattern: 'string', pattern_id: 'string?', equipment: 'string', equipment_tags: 'string[]',
          targets: 'string[]+', primary_target: 'string', level: 'string',
          level_min: { enum: ['beginner', 'intermediate', 'advanced'] }, level_max: { enum: ['beginner', 'intermediate', 'advanced'] },
          execution: 'string', safety: 'string', goal_tags: 'string[]+', alternative_names: 'string[]+',
          alternative_ids: 'string[]+', unresolved_alternatives: 'string[]', ...PROV,
        },
      },
      {
        name: 'stub exercise', idPattern: /^EX-S\d{3}$/,
        fields: {
          id: 'string', name: 'string', status: { enum: ['details_pending_review'] },
          execution: 'null', safety: 'null', equipment: 'null', level: 'null',
          referenced_by: 'string[]+', note: 'string', ...PROV,
        },
      },
    ],
  },
  'movement_patterns.json': { variants: [{ name: 'pattern', idPattern: /^[a-z_]+$/, fields: { id: 'string', name: 'string', definition: 'string', examples: 'string[]+', ...PROV } }] },
  'muscle_groups.json': { variants: [{ name: 'muscle group', idPattern: /^[a-z_]+$/, fields: { id: 'string', name: 'string', actions: 'string', example_patterns_exercises: 'string[]+', ...PROV } }] },
  'programmes.json': {
    variants: [{
      name: 'programme', idPattern: /^P\d{2}$/,
      fields: {
        id: 'string', title: 'string', goal_text: 'string', schedule_text: 'string', progression_guardrail_text: 'string',
        goals: 'string[]+', levels: 'string[]', level_basis: 'string', audience: 'string[]', equipment_profile: 'string',
        equipment_basis: 'string', days_per_week: 'int|int[]', day_names: 'string[]', sessions: 'array',
        requires_qualified_coach: 'bool', requires_clinician_review_when_indicated: 'bool', not_default_for: 'string[]', ...SRC, ...PROV,
      },
    }],
  },
  'programme_examples.json': {
    variants: [{ name: 'programme example', idPattern: /^PX\d{2}$/, fields: { id: 'string', title: 'string', days: 'array', progression_text: 'string', is_individual_prescription: 'bool', note: 'string', ...SRC, ...PROV } }],
  },
  'training_principles.json': {
    variants: [
      { name: 'principle', idPattern: /^principle_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } },
      { name: 'rule', idPattern: /^(biomech|prog)_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } },
    ],
  },
  'goal_programming.json': {
    top: { acsm_2026_synthesis: 'object' },
    variants: [{ name: 'goal', idPattern: /^[a-z_]+$/, fields: { id: 'string', goal: 'string', primary_emphasis: 'string', starting_approach: 'string', key_caution: 'string', ...SRC, ...PROV } }],
  },
  'loading_variables.json': { variants: [{ name: 'variable', idPattern: /^[a-z0-9_]+$/, fields: { id: 'string', variable: 'string', definition: 'string', implementation: 'string', ...SRC, ...PROV } }] },
  'splits.json': {
    top: { frequency_volume_note: 'object' },
    variants: [{ name: 'split', idPattern: /^[a-z0-9_]+$/, fields: { id: 'string', split: 'string', good_fit: 'string', trade_off: 'string', ...SRC, ...PROV } }],
  },
  'failure_fatigue.json': { variants: [{ name: 'note', idPattern: /^[a-z_]+$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } }] },
  'experience_levels.json': { variants: [{ name: 'level', idPattern: /^[a-z_]+$/, fields: { id: 'string', level: 'string', typical_characteristics: 'string', programming_priorities: 'string', avoid: 'string', ...SRC, ...PROV } }] },
  'hypertrophy_guidance.json': {
    top: { intro: 'object' },
    variants: [{ name: 'muscle guidance', idPattern: /^[a-z_]+$/, fields: { id: 'string', muscle_pattern: 'string', exercise_options: 'string', programming_notes: 'string', ...SRC, ...PROV } }],
  },
  'strength_powerlifting.json': {
    variants: [
      { name: 'comparison row', idPattern: /^(specificity|loading|accessories|testing|peaking)$/, fields: { id: 'string', element: 'string', general_strength: 'string', powerlifting_preparation: 'string', ...SRC, ...PROV } },
      { name: 'powerlifting rule', idPattern: /^pl_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } },
    ],
  },
  'body_composition.json': { variants: [{ name: 'statement', idPattern: /^bodycomp_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } }] },
  'sport_demands.json': {
    top: { athlete_note: 'string' },
    variants: [{ name: 'sport', idPattern: /^[a-z_]+$/, fields: { id: 'string', sport: 'string', important_physical_qualities: 'string', programme_design_implications: 'string', ...SRC, ...PROV } }],
  },
  'cardio.json': {
    top: { who_guidance: 'object', concurrent_training: 'object' },
    variants: [{ name: 'cardio method', idPattern: /^[a-z0-9_]+$/, fields: { id: 'string', method: 'string', description: 'string', use: 'string', ...SRC, ...PROV } }],
  },
  'equipment_strategies.json': { variants: [{ name: 'equipment', idPattern: /^[a-z0-9_]+$/, fields: { id: 'string', equipment_constraint: 'string', programming_strategy: 'string', example_movement_choices: 'string', ...SRC, ...PROV } }] },
  'substitution_rules.json': { variants: [{ name: 'rule', idPattern: /^subst_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } }] },
  'nutrition.json': {
    top: { intro: 'object' },
    variants: [{ name: 'nutrition topic', idPattern: /^[a-z0-9_]+$/, fields: { id: 'string', topic: 'string', general_guidance: 'string', boundary: 'string', ...SRC, ...PROV } }],
  },
  'recovery.json': { variants: [{ name: 'statement', idPattern: /^recovery_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } }] },
  'special_populations.json': { variants: [{ name: 'population', idPattern: /^[a-z_]+$/, fields: { id: 'string', population: 'string', programming_guardrails: 'string', escalation: 'string', ...SRC, ...PROV } }] },
  'red_flags.json': { variants: [{ name: 'red flag', idPattern: /^redflag_\d{2}$/, fields: { id: 'string', text: 'string', ...SRC, ...PROV } }] },
  'generator_framework.json': { variants: [{ name: 'step', idPattern: /^step_\d_[a-z_]+$/, fields: { id: 'string', order: 'int', step: 'string', inputs_decision: 'string', output: 'string', ...SRC, ...PROV } }] },
  'sources.json': { variants: [{ name: 'source', idPattern: /^S\d{2}$/, fields: { id: 'string', citation: 'string', url: 'string', doi: 'string?', verified_by_engineering: 'bool' } }] },
  'evidence_grading.json': { variants: [{ name: 'evidence label', idPattern: /^[a-z_]+$/, fields: { id: 'string', label: 'string', meaning: 'string', how_big_kat_should_use_it: 'string', ...SRC, ...PROV } }] },
  'fitness_faq.json': {
    variants: [{
      name: 'faq', idPattern: /^FAQ-\d{3}$/,
      fields: {
        id: 'string', question: 'string', alternative_phrasings: 'string[]+', keywords: 'string[]+', intent_label: 'string',
        intent_category: 'string', safety_sensitive: 'bool', level_raw: 'string', levels: 'string[]', audience: 'string[]',
        short_answer: 'string', detailed_explanation: 'string', practical_recommendation: 'string', misconception: 'string',
        warning: 'string', related_topics_raw: 'string[]+', related_topics: 'string[]+', source_ids: 'string[]+',
        evidence_text: 'string', evidence_labels: 'string[]+', tone_text: 'string', max_humour_level: 'string?', ...PROV,
      },
    }],
  },
  'related_concepts.json': { variants: [{ name: 'related concept', idPattern: /^.+$/, fields: { id: 'string', listed_as_related_by: 'string[]+', also_in_keywords_of: 'string[]', ...PROV } }] },
  'intent_categories.json': { variants: [{ name: 'intent category', idPattern: /^[a-z_]+$/, fields: { id: 'string', description: 'string', origin: { enum: ['doc2_section_1', 'engineering_added'] }, legacy_labels: 'string[]', faq_count: 'int' } }] },
  'keyword_index.json': { variants: [{ name: 'keyword row', idPattern: /^kw_[a-z0-9_]+$/, fields: { id: 'string', terms: 'string[]+', canonical_concepts: 'string[]', ambiguity_action: 'string', retrieval_enabled: 'bool', ...PROV } }] },
  'abbreviations.json': { variants: [{ name: 'abbreviation', idPattern: /^abbr_[a-z0-9]+$/, fields: { id: 'string', abbreviation: 'string', keyword_record: 'string', canonical_concepts: 'string[]+', ambiguous: 'bool', ambiguity_action: 'string', ...PROV } }] },
  'misconceptions.json': { variants: [{ name: 'misconception', idPattern: /^misc_[a-z0-9_]+$/, fields: { id: 'string', misconception: 'string', correction: 'string', chatbot_delivery: 'string', ...PROV } }] },
  'humour_personality.json': {
    top: { philosophy: 'string', golden_rule: 'string', levels: 'array', decision_matrix: 'array' },
    variants: [{ name: 'humour family', idPattern: /^humour_[a-z0-9_]+$/, fields: { id: 'string', family: 'string', useful_techniques: 'string', example_original: 'string', use_carefully: 'string', ...PROV } }],
  },
  'safety_responses.json': {
    top: { local_emergency_resources_note: 'string' },
    variants: [{ name: 'safety trigger', idPattern: /^SAFE-\d{2}$/, fields: { id: 'string', trigger: 'string', chatbot_action: 'string', example_language: 'string', humour_level: { enum: ['H0'] }, detection_keywords: 'string[]', ...PROV } }],
  },
  'conversation_rules.json': {
    variants: [
      { name: 'architecture layer', idPattern: /^layer_[a-z0-9_]+$/, fields: { id: 'string', layer: 'string', responsibility: 'string', example: 'string', ...PROV } },
      { name: 'rule', idPattern: /^(contract|rank|qa)_\d{2}$/, fields: { id: 'string', text: 'string', ...PROV } },
    ],
  },
  'plan_schema.json': {
    variants: [
      { name: 'generator input', idPattern: /^in_[a-z0-9_]+$/, fields: { id: 'string', input: 'string', why_it_matters: 'string', example_values: 'string', ...PROV } },
      { name: 'plan output field', idPattern: /^[a-z_]+$/, fields: { id: 'string', field: 'string', required_content: 'string', ...PROV } },
    ],
  },
  'response_examples.json': { variants: [{ name: 'example', idPattern: /^example_\d{2}$/, fields: { id: 'string', user_message: 'string', recommended_answer_style: 'string', ...PROV } }] },
  'metadata.json': {
    variants: [{ name: 'metadata', idPattern: /^knowledge_base$/, fields: { id: 'string', name: 'string', knowledge_version: 'string', source_review_date: 'string', source_documents: 'array', files: 'string[]+', engineering_derived_fields: 'string[]+', sources_verified_by_engineering: 'bool', ...PROV } }],
  },
};

// Record counts the source documents define. Used as exact-count checks.
const EXPECTED_COUNTS = {
  'movement_patterns.json': 10, 'muscle_groups.json': 10, 'programmes.json': 11, 'programme_examples.json': 1,
  'goal_programming.json': 5, 'loading_variables.json': 6, 'splits.json': 5, 'experience_levels.json': 4,
  'hypertrophy_guidance.json': 7, 'sport_demands.json': 9, 'cardio.json': 5, 'equipment_strategies.json': 6,
  'substitution_rules.json': 4, 'nutrition.json': 7, 'recovery.json': 5, 'special_populations.json': 7,
  'red_flags.json': 4, 'generator_framework.json': 8, 'sources.json': 11, 'evidence_grading.json': 5,
  'fitness_faq.json': 40, 'keyword_index.json': 16, 'misconceptions.json': 10, 'humour_personality.json': 4,
  'safety_responses.json': 8, 'response_examples.json': 5, 'body_composition.json': 5, 'failure_fatigue.json': 2,
};

module.exports = { SCHEMAS, EXPECTED_COUNTS };
