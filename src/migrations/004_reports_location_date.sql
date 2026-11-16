-- Equipment reports: where the problem is, and when it was reported.
-- Reports made before this migration have no recorded date, so created_at stays NULL for them
-- (we do not invent dates). Every new report gets a real UTC timestamp from the server.
ALTER TABLE Reports ADD COLUMN location   TEXT;
ALTER TABLE Reports ADD COLUMN created_at TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_user ON Reports (user_id, id);
