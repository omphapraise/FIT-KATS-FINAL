const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbFile = process.env.DB_FILE || 'fitkats.db';
const db = new Database(path.join(__dirname, '..', dbFile));

// Turn on foreign key checking so relationships are enforced
db.pragma('foreign_keys = ON');

// ------------------------------------------------------------
// MIGRATIONS
// Every .sql file in src/migrations runs once, in filename order.
// Applied files are remembered in the schema_migrations table, so
// existing data is never touched and new tables arrive safely.
// ------------------------------------------------------------
function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
    console.log(`Applied migration ${file}`);
  }
}

runMigrations();

module.exports = db;
