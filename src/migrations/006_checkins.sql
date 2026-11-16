-- 006: QR check-ins. One row per successful kiosk scan.
CREATE TABLE IF NOT EXISTS CheckIns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  checked_in_at TEXT    NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'qr',
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checkins_user_time ON CheckIns (user_id, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_checkins_time ON CheckIns (checked_in_at);