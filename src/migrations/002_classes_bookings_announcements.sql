-- Membership tiers: perks now live on the server instead of inside the app
CREATE TABLE IF NOT EXISTS MembershipTiers (
  name       TEXT PRIMARY KEY CHECK (name IN ('Silver','Gold','Platinum')),
  price_rand REAL NOT NULL CHECK (price_rand >= 0),
  tagline    TEXT NOT NULL,
  perks      TEXT NOT NULL,            -- JSON array of strings
  sort_order INTEGER NOT NULL
);

INSERT OR IGNORE INTO MembershipTiers (name, price_rand, tagline, perks, sort_order) VALUES
 ('Silver', 499,  'Everything you need to train',
  '["Gym access 05:00 to 22:00","2 group classes per week","Locker hire discount"]', 1),
 ('Gold', 899,   'More classes, more perks',
  '["Gym access 05:00 to 22:00","Unlimited group classes","1 guest pass per month","Free fitness assessment"]', 2),
 ('Platinum', 1499, 'The full Fit Kats experience',
  '["24/7 gym access","Unlimited group classes","Priority class booking","Monthly personal training session","Towel and locker service","2 guest passes per month"]', 3);

-- Group classes. starts_at / ends_at are UTC ISO strings (e.g. 2026-11-10T04:30:00.000Z)
CREATE TABLE IF NOT EXISTS Classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  coach        TEXT    NOT NULL,
  starts_at    TEXT    NOT NULL,
  ends_at      TEXT    NOT NULL,
  capacity     INTEGER NOT NULL CHECK (capacity > 0),
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0,1)),
  UNIQUE (title, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_classes_starts ON Classes (starts_at);

-- One row per member per class. Cancelling flips the status, re-booking flips it back.
CREATE TABLE IF NOT EXISTS Bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed','Cancelled')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_id, user_id),
  FOREIGN KEY (class_id) REFERENCES Classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES Users(id)   ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookings_user  ON Bookings (user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_class ON Bookings (class_id, status);

CREATE TABLE IF NOT EXISTS Announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL UNIQUE,
  body         TEXT    NOT NULL,
  published_at TEXT    NOT NULL,
  is_pinned    INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1))
);

CREATE TABLE IF NOT EXISTS AnnouncementReads (
  user_id         INTEGER NOT NULL,
  announcement_id INTEGER NOT NULL,
  read_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, announcement_id),
  FOREIGN KEY (user_id)         REFERENCES Users(id)         ON DELETE CASCADE,
  FOREIGN KEY (announcement_id) REFERENCES Announcements(id) ON DELETE CASCADE
);
