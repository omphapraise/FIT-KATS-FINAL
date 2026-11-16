-- 009_roles_staff_tools.sql
-- Additive only: roles, verification, staff tools, audit trail, one-time password setup codes.

ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member','staff','manager'));
ALTER TABLE Users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
  CHECK (is_active IN (0,1));
ALTER TABLE Users ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified'
  CHECK (verification_status IN ('pending','verified','rejected'));
ALTER TABLE Users ADD COLUMN id_type_sighted TEXT
  CHECK (id_type_sighted IS NULL OR id_type_sighted IN ('sa_id','passport','drivers_licence','other'));
ALTER TABLE Users ADD COLUMN phone TEXT;
ALTER TABLE Users ADD COLUMN created_at TEXT;
ALTER TABLE Users ADD COLUMN activated_at TEXT;

ALTER TABLE Payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'membership'
  CHECK (payment_type IN ('membership','signup_fee','freeze_fee','cancellation_penalty'));

ALTER TABLE Reports ADD COLUMN severity TEXT
  CHECK (severity IS NULL OR severity IN ('Low','Medium','High'));
ALTER TABLE Reports ADD COLUMN equipment_name TEXT;
ALTER TABLE Reports ADD COLUMN assigned_to INTEGER REFERENCES Users(id) ON DELETE SET NULL;
ALTER TABLE Reports ADD COLUMN resolution_note TEXT;
ALTER TABLE Reports ADD COLUMN updated_at TEXT;

ALTER TABLE Announcements ADD COLUMN author_id INTEGER REFERENCES Users(id) ON DELETE SET NULL;
ALTER TABLE Announcements ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('published','archived'));

ALTER TABLE CheckIns ADD COLUMN checked_in_by INTEGER REFERENCES Users(id) ON DELETE SET NULL;

CREATE TABLE AuditLog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES Users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_target ON AuditLog (target_type, target_id, id);
CREATE INDEX idx_audit_actor  ON AuditLog (actor_id, id);

CREATE TABLE StaffNotes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES Users(id) ON DELETE SET NULL,
  note       TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_staffnotes_member ON StaffNotes (member_id, id);

CREATE TABLE ReportEvents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id   INTEGER NOT NULL REFERENCES Reports(id) ON DELETE CASCADE,
  actor_id    INTEGER REFERENCES Users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status   TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_reportevents_report ON ReportEvents (report_id, id);

CREATE TABLE PasswordSetups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  revoked_at TEXT,
  created_by INTEGER REFERENCES Users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_pwsetups_user ON PasswordSetups (user_id, id);
