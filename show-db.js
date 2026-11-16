const db = require('./src/db');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();

console.log('\nFIT KATS DATABASE');
console.log('=================\n');

for (const { name } of tables) {
  console.log(`TABLE: ${name}`);

  const columns = db.prepare(`PRAGMA table_info(${name})`).all();
  for (const c of columns) {
    const flags = [c.pk ? 'PRIMARY KEY' : '', c.notnull ? 'NOT NULL' : ''].filter(Boolean).join(', ');
    console.log(`  - ${c.name.padEnd(20)} ${c.type.padEnd(8)} ${flags}`);
  }

  const keys = db.prepare(`PRAGMA foreign_key_list(${name})`).all();
  for (const k of keys) {
    console.log(`  * FOREIGN KEY ${k.from} -> ${k.table}(${k.to})`);
  }

  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  console.log(`  Records: ${total}\n`);
}

console.log('USERS (first 5, passwords are stored hashed and are not shown)');
console.table(
  db.prepare('SELECT id, email, display_name, membership_tier, membership_expiry, loyalty_points FROM Users LIMIT 5').all()
);

console.log('NEWEST WORKOUTS');
console.table(
  db.prepare('SELECT id, user_id, exercise_name, sets, reps, weight, date FROM Workouts ORDER BY id DESC LIMIT 5').all()
);

console.log('NEWEST FAULT REPORTS');
console.table(
  db.prepare('SELECT id, user_id, description, status FROM Reports ORDER BY id DESC LIMIT 5').all()
);