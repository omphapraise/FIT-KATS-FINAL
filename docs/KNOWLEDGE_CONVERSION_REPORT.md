# Big Kat knowledge base: conversion report

Version 1.0.0, source review date 2026-11-10.
Sources: BK-KB-001 (Fitness Science and Workout Programming) and BK-AI-002 (Fitness AI Chatbot Knowledge and Responses).

## 1. What this delivers

Both documents converted to read-only JSON in `backend\knowledge\` (37 files, 467 records, about 316 KB), plus a zero-dependency validator in `backend\scripts\`.

NOT built yet: the loader, retrieval, the programme generator, the API routes, migration 008, the endpoint tests and any Android UI. Nothing here is wired into `server.js`. No website integration is claimed or built.

## 2. Files

BK-KB-001 (exercise science and programming):

- exercises, movement_patterns, muscle_groups
- programmes (P01 to P11), programme_examples (PX01, the section 4 hypertrophy week)
- training_principles, goal_programming, loading_variables, splits, failure_fatigue, experience_levels
- hypertrophy_guidance, strength_powerlifting, body_composition
- sport_demands, cardio, equipment_strategies, substitution_rules
- nutrition, recovery, special_populations, red_flags
- generator_framework, sources, evidence_grading

BK-AI-002 (chatbot):

- fitness_faq (FAQ-001 to FAQ-040), related_concepts, intent_categories
- keyword_index, abbreviations
- misconceptions, humour_personality, safety_responses
- conversation_rules (architecture layers, response contract, ranking rules, QA checklist)
- plan_schema (generator inputs and plan output fields), response_examples

Shared: metadata.json (document control, coverage matrices, source gaps, list of files).

Every file has the same envelope: file, knowledge_version, source_document, source_review_date, records. Every record carries a provenance section reference. Source text is kept verbatim.

## 3. How it was made, and what is derived

Text was extracted straight from the .docx tables and paragraphs by script, not retyped. As an independent check, 824 text fields were compared against a separate pandoc conversion of the same .docx files: 0 differences.

These fields are engineering-derived (not written in the sources). Each is labelled in the data:

- exercises: pattern_id, equipment_tags, level_min and level_max, primary_target (first listed target), alternative_ids, goal_tags
- programmes: the structured session slots, goals, levels, equipment_profile and their `*_basis` fields
- fitness_faq: intent_category, safety_sensitive, levels and audience split, evidence_labels, max_humour_level (only where the source says no jokes)
- safety_responses: humour_level H0 on every row (design decision: no humour in any safety-gate reply)
- abbreviations: only the 8 abbreviations in the Doc 2 section 4 table, with the source's own concept names

Aliases I applied when linking programme movements to library exercises (reviewer should confirm): bench and bench press to EX-001, squat and back squat to EX-011, deadlift to EX-014, RDL to EX-013, pulldown to EX-004 (the only pulldown in the library). Also: "Hip extension" (hip thrust) is mapped to the hinge pattern because section 1.2 lists hip thrust under Hinge.

## 4. Validation

`node scripts/validate-knowledge.js` runs 19 checks: JSON parses, schema per file, unique ids, exact record counts, EX-001 to EX-024 and FAQ-001 to FAQ-040 complete, stub exercises carry no technique text, every cross reference and source id resolves, the quarantined keyword row is not retrievable, metadata lists exactly the files on disk.

Result in Claude's sandbox (Node 22): 19 passed, 0 failed, 5 warnings. A mutation test (6 deliberate corruptions in a copy) failed as it should.

NOT yet verified on your machine. Run `node scripts/validate-knowledge.js` from `C:\Users\ompha\FitKats\backend` and paste the output.

## 5. Flags found in the source documents

1. Missing exercise records. 46 movements are named in programmes or as alternatives but have no library record (the library has 24). 29 appear only as alternatives; 17 are used in at least one programme. They are stored as EX-S001 to EX-S046 with status details_pending_review and null technique, safety, equipment and level. 7 have a movement pattern taken from an explicit example in section 1.2. Some look like the same movement under two names (for example Seated row and Seated cable row, DB RDL and Romanian deadlift); they carry a review_hint and were not merged.
2. Thin programme coverage. Only P01 to P11 exist. There are no separate advanced, powerlifting, athletic, sport or home files, no periodisation content and no cycling or swimming programme. P06 has no set or rep numbers. P03 Upper B and Lower B have no exercise lists. Levels are not stated for P05 to P09 (stored as an empty list, not guessed).
3. P05 uses RPE 6 to 8 while S01 is cited for heavier loads (80% 1RM or more) for strength. Stored as written, labelled coaching application.
4. Beginner set counts differ: FAQ-001 says 1 to 3 sets, FAQ-004 says 2 to 3, P01 uses 2, P09 uses 3.
5. The Doc 2 keyword table has a garbled row: "surrogate; pregnancy" with "Not a fitness keyword by default". Kept as kw_surrogate with retrieval_enabled false. Pregnancy is reached through FAQ-037.
6. Doc 2 names 8 intent types, but the 40 FAQs use 28 different intent labels. All 28 are mapped onto the 8. No FAQ fits "motivation". Two categories were added: myth_correction and special_population.
7. Citations: S05 (creatine) is cited by only FAQ-016 and FAQ-039 and not in the Doc 1 creatine row. Nutrition table rows carry no per-row citations (S04 is cited in the section intro only). S09 is an index page, cited by FAQ-024, FAQ-025 and FAQ-038. S08 is cited by no FAQ (only by the Doc 1 adolescents row). S10 is the "at a glance" version of S02. 10 of 11 sources have no DOI. None has been verified.
8. No programme exists for under-18s, so the generator must refuse and refer. Neither document has South African emergency or clinical resources; safety_responses.json has local_emergency_resources set to null.
9. The documents give no retrieval confidence threshold (their own gap list asks for one). It will be an engineering decision, tuned with tests.
10. The documents contain no misspellings, slang or local-language variants (their own gap list says so). Any typo handling will be computed at runtime and labelled engineering-derived.
11. The Workouts table has no RIR, RPE, pain or missed-session fields. Programme adaptation can only use logged weight, reps and sets plus values the user sends in the request. It must never raise loads automatically.
12. Five library exercises have no section 1.2 pattern (single-joint actions): EX-007, EX-008, EX-009, EX-016, EX-018. pattern_id is null with a pattern_note.
13. Two related-topic tokens differ only by a space ("training max" and "training_max"). They are merged to training_max.
14. P10 says "prone Y/T or bandless row substitute only if equipment exists". The wording is odd; kept verbatim.
15. PX01 (the section 4 four-day hypertrophy week) and P03 (intermediate upper/lower) are similar but not identical. Both are kept.

## 5b. Hard limits

- Humour is stored only in humour_personality.json. Every safety response is H0.
- Educational use for generally healthy adults. No diagnosis, no clinical programmes.
- The knowledge base never claims semantic search; retrieval will be keyword, phrase and synonym scoring.

## 6. Needs your input

- Approved South African emergency and clinical wording (or confirm a placeholder).
- Whether a human reviewer will fill the 46 stub records, or the app should show names only for them.
- Confirm the aliases in section 3.

## 7. Next build steps

Loader and retrieval, then the generator, then routes behind requireAuth (no /api prefix, responses in the existing success, message, data shape), then migration 008 for saved programmes, then tests against the real API, then docs. Android UI only if you ask.
