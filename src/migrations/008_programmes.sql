-- Saved Big Kat programmes. One row per generated plan that the member kept.
-- Only plans of type "plan" are saved; stop / refer / coach_required / no_match are never stored.
CREATE TABLE IF NOT EXISTS SavedProgrammes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  programme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  input_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  knowledge_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_programmes_user ON SavedProgrammes (user_id, id);