# Big Kat: knowledge base, chatbot and programmes

Last updated: 2026-11-11

## What it is

Big Kat is a read-only fitness knowledge base plus a rules-based programme generator, added to the existing Fit Kats API. The content comes from two source documents (BK-KB-001 Fitness Science and Workout Programming, BK-AI-002 Chatbot Knowledge and Responses), converted into JSON files in `backend/knowledge` (37 files, 467 records, knowledge version 1.0.0).

It is NOT a language model and NOT semantic search. The chatbot finds answers with lexical retrieval: word scoring, typo correction, abbreviation and synonym expansion, then a confidence level. Every endpoint needs a logged-in member (`Authorization: Bearer <token>`). Responses use the usual `{ success, message, data }` shape.

## Code map

    backend/knowledge/*.json              the converted knowledge (read-only, loaded once at startup)
    backend/scripts/validate-knowledge.js checks the JSON (npm run validate:knowledge)
    backend/src/knowledge/loader.js       loads, freezes and indexes the JSON
    backend/src/knowledge/retrieval.js    safety gate + FAQ retrieval
    backend/src/knowledge/generator.js    programme generator (no database)
    backend/src/routes/knowledge.js       knowledge + chatbot endpoints
    backend/src/routes/programmes.js      saved programmes endpoints
    backend/src/migrations/008_programmes.sql   SavedProgrammes table
    backend/test-knowledge.js             81 API checks

## Knowledge endpoints

    GET  /knowledge                      version, file count, record count, file list
    GET  /knowledge/categories           intent categories
    GET  /knowledge/search?q=            ranked FAQ ids (2-200 chars, optional limit 1-10)
    GET  /knowledge/faqs/:id             one FAQ (FAQ-001 .. FAQ-040)
    GET  /knowledge/exercises/search?q=  exercises matching text (2-60 chars, max 20)
    GET  /knowledge/exercises/:id        one exercise (EX-001 .. EX-024, stubs EX-S001 .. EX-S046)
    GET  /knowledge/programmes           the 11 source programmes (summary)
    GET  /knowledge/programmes/:id       one source programme (P01 .. P11)

Errors: 400 for a bad id or search text, 404 when nothing matches, 401 without login.

## Chatbot endpoints

    POST /fitness-ai/answer   body { "message": "is creatine safe", "context": { "last_faq_id": "FAQ-016", "level": "beginner" } }
    POST /fitness-ai/search   body { "query": "creatine", "limit": 5 }

`message` must be 2 to 500 characters. `context` is optional. The answer comes back in `data` with a `type`:

- `faq`: a primary answer (short answer, explanation, practical recommendation, misconception, warning, sources, evidence labels) plus up to 3 related questions. `confidence` is `high` or `medium`; medium adds a `note`.
- `clarification`: low confidence. Up to 3 options to choose from.
- `none`: nothing relevant found.
- `safety`: a safety response. It always wins over a FAQ, is delivered at humour level H0, and never gives workout advice.

Ambiguous abbreviations are handled openly: a bare "bp" returns a medium-confidence answer with the source's note that BP may mean blood pressure.

### Safety triggers

The safety gate runs before any FAQ matching. These are covered: SAFE-01 (chest pain or pressure, fainting, severe breathlessness, stroke signs), SAFE-02 (sharp, worsening or unusual pain), SAFE-03 (eating-disorder cues), SAFE-04 (a minor asking about weight loss or supplements). SAFE-05 to SAFE-08 exist in the data but have no detection patterns yet (the source gives no trigger wording). The detection patterns are engineering-derived and deliberately cautious.

No South African emergency or clinical contact numbers exist in the source documents, so none are shown. `local_emergency_resources` is `null` with a note until approved text is supplied.

## Programme generator

    POST /programmes/generate

Body fields:

- `goal`: muscle_gain, strength, fat_loss, general_fitness, endurance, sport_performance, mobility_function, powerlifting
- `experience`: beginner, intermediate, advanced, returning
- `age_band`: under_18, 18_64, 65_plus
- `days_per_week`: 2 to 6
- `equipment`: full_gym, barbell, home_dumbbells, bodyweight, bands
- optional: `session_minutes` (20-180), `pregnancy_status` (none, pregnant, postpartum), `health_condition` (true/false), `limitations` (text, 300 max), `sport` (needed for sport_performance; football and running are covered), `dislikes` (up to 10 exercise names)

There is no gender input. The source says sex or gender must not dictate exercise choice. Extra fields are ignored and never stored.

The generator SELECTS and adapts the closest existing programme (P01 to P11). It never invents sets, reps or exercises. Safety gate first, then goal, level, logistics, preferences, dose and progression, following the source's generator framework. `data.type` is one of:

- `plan`: saved, returned with HTTP 201 and `saved: true`.
- `refer`: under 18, pregnancy or postpartum. Not saved. Points to the source's guardrail and escalation text.
- `stop`: red-flag symptoms in `limitations`. Not saved.
- `coach_required`: powerlifting (P06 needs a qualified coach). Not saved.
- `no_match`: nothing fits the combination. Not saved.

Exercises that the source names but never describes (the 46 stubs) are shown by name only, flagged `pending_review`, with no technique or safety text. Where the source gives no set and rep numbers, no exercise list, or no level, the plan says so.

## Saved programmes

    GET    /programmes             my saved programmes, newest first
    GET    /programmes/:id         one saved plan (404 if it is not yours)
    POST   /programmes/:id/adapt   body { "feedback": "too_hard", "note": "optional" }
    DELETE /programmes/:id         delete one of mine

Rules: a member can keep at most 20 programmes (409 after that). Every query is scoped to the logged-in member, so someone else's id returns 404.

Adapt is advice only. `feedback` is one of too_hard, too_easy, missed_sessions, time_short, pain. The saved plan is never changed (`plan_changed: false`) and loads are never raised automatically (`auto_increase_loads: false`). Each piece of guidance says where it comes from: `programme` (quoted from the source), `engineering_default`, `source_gap` (the source is silent) or `design`. `pain`, or a red-flag word in `note`, switches to the safety stop at H0. Adapt does not read your logged workouts yet.

## Tests

From `backend`, with the API running:

    node test-knowledge.js

81 checks: login required, every knowledge endpoint, chatbot keyword and natural-language cases, typos, abbreviations, nonsense, safety cases, 12 generator personas, stub rules, adapt, member separation, the 20-plan cap and delete. Last real run (2026-11-11): 81 passed, 0 failed.

## Engineering-derived choices (not in the source documents)

- Safety detection patterns and the minor-plus-weight-loss rule.
- Retrieval weights and the confidence thresholds (high: exact match, or coverage 0.6 with a clear margin; medium: coverage 0.4).
- Typo correction, compound-word splitting and stemming.
- Programme scoring, the equipment compatibility table, "returning" treated as beginner, the 20-programme cap, and the adapt guidance wording marked `engineering_default`.
- Labels added during conversion: exercise pattern, equipment tags, levels, FAQ intent categories and humour caps. These are marked in the data.

## Known gaps

- 46 exercises are named but have no reviewed technique or safety text.
- Only 11 programmes exist, so advanced, powerlifting and endurance coverage is thin. P06 has no set and rep numbers. P03 Upper B and Lower B have no exercise lists. Levels are not stated for P05 to P09 and P11. Most programmes state no session length, so sessions cannot be shortened from the source.
- Beginner set counts differ between FAQ-001, FAQ-004, P01 and P09.
- 10 of 11 sources have no DOI and none has been verified by engineering. A few citations are loose (see `backend/docs/KNOWLEDGE_CONVERSION_REPORT.md`).
- No South African emergency contacts, no SAFE-05 to SAFE-08 detection, no blood-pressure FAQ.
- The Workouts table has no RIR, RPE or pain fields, so adapt cannot use them.
- No Android screen uses these endpoints yet.