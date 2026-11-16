-- 007: referrals. Codes are created on first use (see src/referrals.js), so existing rows stay NULL here.
ALTER TABLE Users ADD COLUMN referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code
  ON Users (referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS Referrals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referred_id INTEGER NOT NULL UNIQUE,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'capped')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  rewarded_at TEXT,
  FOREIGN KEY (referrer_id) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_id) REFERENCES Users(id) ON DELETE CASCADE,
  CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON Referrals (referrer_id, status);