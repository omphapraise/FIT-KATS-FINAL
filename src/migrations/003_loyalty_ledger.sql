-- Loyalty ledger: every points change is a row. Users.loyalty_points stays as a cached balance
-- that is only ever changed together with a ledger row (see src/loyalty.js).
CREATE TABLE IF NOT EXISTS LoyaltyTransactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  points     INTEGER NOT NULL,                 -- positive = earned, negative = spent
  reason     TEXT    NOT NULL,                 -- WORKOUT, ADJUSTMENT, later: REDEMPTION, REFERRAL ...
  ref        TEXT,                             -- what it was for, e.g. workout:42
  award_day  TEXT,                             -- South African calendar day (YYYY-MM-DD), used for daily caps
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON LoyaltyTransactions (user_id, id);
CREATE INDEX IF NOT EXISTS idx_loyalty_day  ON LoyaltyTransactions (user_id, reason, award_day);

-- Double-award guard: the same thing (e.g. workout:42) can only ever earn points once per member
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_ref ON LoyaltyTransactions (user_id, reason, ref) WHERE ref IS NOT NULL;

-- Carry every existing balance over as one ADJUSTMENT row so ledger total == balance from day one
INSERT INTO LoyaltyTransactions (user_id, points, reason, ref, award_day)
SELECT id, loyalty_points, 'ADJUSTMENT', 'migration-003', date('now', '+2 hours')
FROM Users WHERE loyalty_points <> 0;

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON Workouts (user_id, date);
