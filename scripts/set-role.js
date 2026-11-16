// Usage (run from the backend folder):
//   node scripts/set-role.js <email> <member|staff|manager>             -> dry run, changes nothing
//   node scripts/set-role.js <email> <member|staff|manager> --confirm   -> applies the change
// Uses whichever database DB_FILE points to (default fitkats.db). Never reads or prints passwords.
require('dotenv').config();
const db = require('../src/db');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['member', 'staff', 'manager'];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const unknownFlags = args.filter((a) => a.startsWith('--') && a !== '--confirm');
const positional = args.filter((a) => !a.startsWith('--'));

if (unknownFlags.length) fail(`Unknown option: ${unknownFlags.join(', ')}`);
if (positional.length !== 2) fail('Usage: node scripts/set-role.js <email> <member|staff|manager> [--confirm]');

const email = positional[0].trim().toLowerCase();
const role = positional[1].trim().toLowerCase();

if (!EMAIL_REGEX.test(email)) fail('That does not look like a valid email address.');
if (!ROLES.includes(role)) fail(`Role must be one of: ${ROLES.join(', ')}`);

const user = db.prepare('SELECT id, email, display_name, role, is_active FROM Users WHERE email = ?').get(email);
if (!user) fail(`No account found for ${email}. Nothing changed.`);

console.log(`Account:      ${user.display_name} <${user.email}> (id ${user.id})`);
console.log(`Current role: ${user.role}`);
console.log(`New role:     ${role}`);

if (user.role === role) {
  console.log('Already has that role. Nothing to do.');
  process.exit(0);
}

if (user.role === 'manager') {
  const managers = db.prepare("SELECT COUNT(*) AS n FROM Users WHERE role = 'manager' AND is_active = 1").get().n;
  if (managers <= 1) fail('Refused: this is the last active manager. Promote another manager first.');
}

if (!confirm) {
  console.log('\nDry run only. Add --confirm to apply this change.');
  process.exit(0);
}

db.transaction(() => {
  db.prepare('UPDATE Users SET role = ? WHERE id = ?').run(role, user.id);
  db.prepare('INSERT INTO AuditLog (actor_id, action, target_type, target_id, detail) VALUES (NULL, ?, ?, ?, ?)')
    .run('role.change', 'user', user.id, JSON.stringify({ from: user.role, to: role, via: 'cli' }));
})();

console.log('\nDone. Role updated and recorded in AuditLog.');
