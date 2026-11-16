-- Your original five tables. IF NOT EXISTS means an existing database is left exactly as it is.

CREATE TABLE IF NOT EXISTS Users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL UNIQUE,
  password          TEXT    NOT NULL,
  display_name      TEXT    NOT NULL,
  membership_tier   TEXT    NOT NULL DEFAULT 'Silver'
                    CHECK (membership_tier IN ('Silver','Gold','Platinum')),
  membership_expiry TEXT    NOT NULL DEFAULT '2026-12-31',
  loyalty_points    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Workouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  exercise_name TEXT    NOT NULL,
  sets          INTEGER NOT NULL CHECK (sets > 0),
  reps          INTEGER NOT NULL CHECK (reps > 0),
  weight        REAL    NOT NULL CHECK (weight >= 0),
  date          TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Settings (
  user_id               INTEGER PRIMARY KEY,
  notifications_enabled INTEGER NOT NULL DEFAULT 1
                        CHECK (notifications_enabled IN (0,1)),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Payments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount  REAL    NOT NULL CHECK (amount >= 0),
  status  TEXT    NOT NULL DEFAULT 'Paid'
          CHECK (status IN ('Paid','Pending','Failed')),
  date    TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  description TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'Open'
              CHECK (status IN ('Open','In Progress','Resolved')),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);
