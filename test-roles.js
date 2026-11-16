// Tests for migration 009: roles, deactivation, verification, shared check-in, activation, set-role CLI.
// Needs the server running and the same DB_FILE / API_URL / KIOSK_KEY as the rest of the suite.
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('child_process');
const db = require('./src/db');
const core = require('./src/checkinCore');
const setupCodes = require('./src/setupCodes');
const auth = require('./src/middleware/auth');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const SECRET = process.env.JWT_SECRET || 'dev_secret';
const KIOSK_KEY = process.env.KIOSK_KEY || '';

let passed = 0;
let failed = 0;
const createdIds = [];

function check(name, condition, extra) {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); }
}

async function call(method, path, { token, kioskKey, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (kioskKey !== undefined) headers['x-kiosk-key'] = kioskKey;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try { json = await res.json(); } catch (e) { /* non-JSON body */ }
  return { status: res.status, json };
}

let counter = 0;
function uniqueEmail(tag) {
  counter += 1;
  return `roletest-${tag}-${Date.now()}-${counter}@fitkats.com`;
}

async function newMember(tag) {
  const email = uniqueEmail(tag);
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: `Role Test ${tag}` } });
  const id = r.json.user && r.json.user.id;
  if (id) createdIds.push(id);
  return { email, id, token: r.json.token };
}

function makePending(tag) {
  const email = uniqueEmail(tag);
  const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const id = db.prepare(`INSERT INTO Users (email, password, display_name, membership_expiry, verification_status, created_at)
                         VALUES (?, ?, 'Walk In Test', '1970-01-01', 'pending', ?)`)
    .run(email, hash, new Date().toISOString()).lastInsertRowid;
  db.prepare('INSERT INTO Settings (user_id, notifications_enabled) VALUES (?, 1)').run(id);
  createdIds.push(id);
  return { email, id };
}

function addCode(userId, opts = {}) {
  const code = setupCodes.generateCode();
  const expires = new Date(Date.now() + (opts.expiresInMs === undefined ? 86400000 : opts.expiresInMs)).toISOString();
  db.prepare('INSERT INTO PasswordSetups (user_id, code_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?)')
    .run(userId, setupCodes.hashCode(code), expires, opts.revoked ? new Date().toISOString() : null);
  return code;
}

function cli(args) {
  const r = spawnSync(process.execPath, ['scripts/set-role.js', ...args], { cwd: __dirname, env: process.env, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const roleOf = (id) => db.prepare('SELECT role FROM Users WHERE id = ?').get(id).role;

function runRole(role, ...allowed) {
  let status = null;
  let nexted = false;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  auth.requireRole(...allowed)({ userRole: role }, res, () => { nexted = true; });
  return { status, nexted };
}

function kioskToken(userId) {
  return jwt.sign({ id: userId, type: 'checkin' }, SECRET + ':checkin', { expiresIn: 60 });
}

async function main() {
  console.log(`Role and verification tests against ${BASE}`);
  if (KIOSK_KEY.length < 16) {
    console.log('  FAIL  KIOSK_KEY missing or shorter than 16 chars');
    process.exit(1);
  }

  // Clean leftovers from a crashed earlier run
  db.prepare("DELETE FROM Users WHERE email LIKE 'roletest-%@fitkats.com'").run();
  db.prepare("DELETE FROM Announcements WHERE title LIKE 'roletest %'").run();

  // ---------- /me and register ----------
  const noAuth = await call('GET', '/me');
  check('GET /me without login -> 401', noAuth.status === 401);

  const a = await newMember('a');
  check('test member registered', !!a.token && !!a.id);
  const me = await call('GET', '/me', { token: a.token });
  check('GET /me -> 200', me.status === 200, `status ${me.status}`);
  check('new member has role member, verified, active',
    me.json.data && me.json.data.role === 'member' && me.json.data.verification_status === 'verified'
    && me.json.data.is_active === true);
  check('new member has a created_at', me.json.data && typeof me.json.data.created_at === 'string');
  check('/me never exposes the password', me.json.data && !('password' in me.json.data));

  const evilEmail = uniqueEmail('evil');
  const evil = await call('POST', '/register', {
    body: { email: evilEmail, password: 'Password123', display_name: 'Role Test Evil', role: 'manager' },
  });
  if (evil.json.user) createdIds.push(evil.json.user.id);
  check('register ignores a role in the body', evil.status === 201 && roleOf(evil.json.user.id) === 'member');

  // ---------- role read from the DB on every request ----------
  db.prepare("UPDATE Users SET role = 'staff' WHERE id = ?").run(a.id);
  const me2 = await call('GET', '/me', { token: a.token });
  check('role change takes effect with the SAME token', me2.json.data && me2.json.data.role === 'staff');
  db.prepare("UPDATE Users SET role = 'member' WHERE id = ?").run(a.id);

  // ---------- requireRole ----------
  let r = runRole('staff', 'staff', 'manager');
  check('requireRole lets staff through', r.nexted === true && r.status === null);
  r = runRole('manager', 'staff', 'manager');
  check('requireRole lets manager through', r.nexted === true);
  r = runRole('member', 'staff', 'manager');
  check('requireRole blocks member with 403', r.nexted === false && r.status === 403);
  r = runRole('staff', 'manager');
  check('requireRole blocks staff from manager-only with 403', r.nexted === false && r.status === 403);
  r = runRole(undefined, 'staff', 'manager');
  check('requireRole blocks a missing role with 403', r.nexted === false && r.status === 403);

  // ---------- deactivation ----------
  const b = await newMember('b');
  db.prepare('UPDATE Users SET is_active = 0 WHERE id = ?').run(b.id);
  r = await call('GET', '/profile', { token: b.token });
  check('deactivated account token -> 401', r.status === 401, `status ${r.status}`);
  r = await call('POST', '/login', { body: { email: b.email, password: 'Password123' } });
  check('deactivated login with correct password -> 403', r.status === 403, `status ${r.status}`);
  r = await call('POST', '/login', { body: { email: b.email, password: 'WrongPassword1' } });
  check('deactivated login with wrong password -> 401 (reveals nothing)', r.status === 401, `status ${r.status}`);
  db.prepare('UPDATE Users SET is_active = 1 WHERE id = ?').run(b.id);
  r = await call('POST', '/login', { body: { email: b.email, password: 'Password123' } });
  check('reactivated account can log in again', r.status === 200, `status ${r.status}`);

  // ---------- pending / rejected / verified check-in ----------
  const c = await newMember('c');
  db.prepare("UPDATE Users SET verification_status = 'pending', membership_expiry = '1970-01-01' WHERE id = ?").run(c.id);
  r = await call('POST', '/login', { body: { email: c.email, password: 'Password123' } });
  check('pending member can still log in', r.status === 200, `status ${r.status}`);
  r = await call('GET', '/me', { token: c.token });
  check('/me shows pending and cannot check in',
    r.json.data && r.json.data.verification_status === 'pending' && r.json.data.can_check_in === false);
  r = await call('GET', '/checkin-token', { token: c.token });
  check('pending member cannot get a QR token -> 403 (pending message first)',
    r.status === 403 && /awaiting verification/i.test(r.json.message || ''), `${r.status} ${r.json.message}`);
  r = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: kioskToken(c.id) } });
  check('pending member kiosk scan -> 403', r.status === 403 && /awaiting verification/i.test(r.json.message || ''), `${r.status}`);
  let cr = core.performCheckin({ userId: c.id, source: 'manual', checkedInBy: a.id });
  check('pending member manual check-in refused (403)', cr.ok === false && cr.status === 403);
  check('no CheckIns row for the pending member',
    db.prepare('SELECT COUNT(*) AS n FROM CheckIns WHERE user_id = ?').get(c.id).n === 0);

  db.prepare("UPDATE Users SET verification_status = 'rejected' WHERE id = ?").run(c.id);
  r = await call('GET', '/checkin-token', { token: c.token });
  check('rejected member cannot get a QR token -> 403', r.status === 403 && /could not be verified/i.test(r.json.message || ''));

  db.prepare("UPDATE Users SET verification_status = 'verified', membership_expiry = '2099-12-31' WHERE id = ?").run(c.id);
  r = await call('GET', '/checkin-token', { token: c.token });
  check('verified member gets a QR token -> 200', r.status === 200, `status ${r.status}`);

  // ---------- sources ----------
  r = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: kioskToken(c.id) } });
  check('kiosk scan for verified member -> 200', r.status === 200, `status ${r.status} ${r.json.message || ''}`);
  let row = db.prepare('SELECT source, checked_in_by FROM CheckIns WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
  check("kiosk check-in recorded with source 'qr' and no staff", row && row.source === 'qr' && row.checked_in_by === null);

  db.prepare('DELETE FROM CheckIns WHERE user_id = ?').run(c.id);
  cr = core.performCheckin({ userId: c.id, source: 'manual', checkedInBy: a.id });
  check('manual check-in ok', cr.ok === true);
  row = db.prepare('SELECT source, checked_in_by FROM CheckIns WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
  check("manual check-in recorded with source 'manual' and the staff id", row && row.source === 'manual' && row.checked_in_by === a.id);
  cr = core.performCheckin({ userId: c.id, source: 'staff_qr', checkedInBy: a.id });
  check('repeat within 5 minutes -> 409 for any source', cr.ok === false && cr.status === 409);
  check('still one CheckIns row',
    db.prepare('SELECT COUNT(*) AS n FROM CheckIns WHERE user_id = ?').get(c.id).n === 1);
  let threw = false;
  try { core.performCheckin({ userId: c.id, source: 'kiosk' }); } catch (e) { threw = true; }
  check('unknown check-in source is rejected', threw);

  // ---------- announcements ----------
  const stamp = Date.now();
  const insAnn = db.prepare('INSERT INTO Announcements (title, body, published_at, is_pinned, status) VALUES (?, ?, ?, 0, ?)');
  insAnn.run(`roletest live ${stamp}`, 'Visible to members', '2026-11-01', 'published');
  const archivedId = insAnn.run(`roletest archived ${stamp}`, 'Hidden from members', '2026-11-01', 'archived').lastInsertRowid;
  r = await call('GET', '/announcements', { token: a.token });
  const titles = (r.json.data || []).map((x) => x.title);
  check('published announcement is listed', titles.includes(`roletest live ${stamp}`));
  check('archived announcement is hidden', !titles.includes(`roletest archived ${stamp}`));
  r = await call('POST', `/announcements/${archivedId}/read`, { token: a.token });
  check('marking an archived announcement read -> 404', r.status === 404, `status ${r.status}`);

  // ---------- reports ----------
  r = await call('POST', '/report-issue', { token: a.token, body: { description: 'Treadmill 3 belt slipping', severity: 'High', equipment_name: 'Treadmill 3' } });
  check('report with severity and equipment -> 201', r.status === 201, `status ${r.status}`);
  const reportId = r.json.data && r.json.data.id;
  check('response columns unchanged (no new keys leak)',
    r.json.data && Object.keys(r.json.data).sort().join(',') === 'created_at,description,id,location,status');
  const rep = db.prepare('SELECT severity, equipment_name FROM Reports WHERE id = ?').get(reportId);
  check('severity and equipment saved', rep && rep.severity === 'High' && rep.equipment_name === 'Treadmill 3');
  const ev = db.prepare('SELECT from_status, to_status, actor_id FROM ReportEvents WHERE report_id = ?').all(reportId);
  check('a ReportEvents row was written (null -> Open, by the member)',
    ev.length === 1 && ev[0].from_status === null && ev[0].to_status === 'Open' && ev[0].actor_id === a.id);
  r = await call('POST', '/report-issue', { token: a.token, body: { description: 'Mirror is cracked', severity: 'Critical' } });
  check('invalid severity -> 400', r.status === 400, `status ${r.status}`);
  r = await call('POST', '/report-issue', { token: a.token, body: { description: 'Locker 9 door is loose' } });
  const plain = db.prepare('SELECT severity, equipment_name FROM Reports WHERE id = ?').get(r.json.data && r.json.data.id);
  check('description-only report still works, severity stays null', r.status === 201 && plain.severity === null && plain.equipment_name === null);

  // ---------- activation (public) ----------
  const p1 = makePending('p1');
  const code1 = addCode(p1.id);
  r = await call('POST', '/activate', { body: { email: p1.email, code: code1, password: 'short' } });
  check('activate with a too-short password -> 400', r.status === 400, `status ${r.status}`);
  r = await call('POST', '/activate', { body: { email: p1.email, code: code1, password: 'MyOwnPassword9' } });
  check('activate with a valid code -> 200', r.status === 200, `status ${r.status} ${r.json.message || ''}`);
  r = await call('POST', '/login', { body: { email: p1.email, password: 'MyOwnPassword9' } });
  check('member can log in with the password they set', r.status === 200, `status ${r.status}`);
  const stillPending = db.prepare('SELECT verification_status FROM Users WHERE id = ?').get(p1.id).verification_status;
  check('activation does not approve the member (still pending)', stillPending === 'pending');
  r = await call('POST', '/activate', { body: { email: p1.email, code: code1, password: 'AnotherPassword9' } });
  check('a setup code cannot be used twice -> 400', r.status === 400, `status ${r.status}`);
  const audit = db.prepare("SELECT COUNT(*) AS n FROM AuditLog WHERE action = 'member.password_set' AND target_id = ?").get(p1.id).n;
  check('password setup was written to AuditLog', audit === 1);
  const stored = db.prepare('SELECT code_hash FROM PasswordSetups WHERE user_id = ?').get(p1.id);
  check('only a hash of the code is stored', stored && stored.code_hash !== code1 && stored.code_hash.length === 64);

  const p2 = makePending('p2');
  const expiredCode = addCode(p2.id, { expiresInMs: -1000 });
  r = await call('POST', '/activate', { body: { email: p2.email, code: expiredCode, password: 'MyOwnPassword9' } });
  check('expired setup code -> 400', r.status === 400, `status ${r.status}`);

  const p3 = makePending('p3');
  const revokedCode = addCode(p3.id, { revoked: true });
  r = await call('POST', '/activate', { body: { email: p3.email, code: revokedCode, password: 'MyOwnPassword9' } });
  check('revoked setup code -> 400', r.status === 400, `status ${r.status}`);

  const p4 = makePending('p4');
  const code4 = addCode(p4.id);
  r = await call('POST', '/activate', { body: { email: p2.email, code: code4, password: 'MyOwnPassword9' } });
  check("another member's code with the wrong email -> 400", r.status === 400, `status ${r.status}`);
  check('that code was not consumed',
    db.prepare('SELECT used_at FROM PasswordSetups WHERE user_id = ?').get(p4.id).used_at === null);

  const limitEmail = uniqueEmail('limit');
  let last = null;
  for (let i = 1; i <= 5; i++) {
    last = await call('POST', '/activate', { body: { email: limitEmail, code: 'ABCDE-FGHJK', password: 'MyOwnPassword9' } });
  }
  check('5 wrong attempts are answered with 400', last.status === 400, `status ${last.status}`);
  r = await call('POST', '/activate', { body: { email: limitEmail, code: 'ABCDE-FGHJK', password: 'MyOwnPassword9' } });
  check('the 6th attempt for the same email -> 429', r.status === 429, `status ${r.status}`);

  // ---------- set-role CLI ----------
  const s = await newMember('cli');
  let c1 = cli([s.email, 'staff']);
  check('set-role dry run exits 0 and changes nothing', c1.status === 0 && roleOf(s.id) === 'member', c1.out);
  c1 = cli([s.email, 'admin', '--confirm']);
  check('set-role rejects an unknown role', c1.status !== 0 && roleOf(s.id) === 'member');
  c1 = cli([`roletest-nobody-${Date.now()}@fitkats.com`, 'staff', '--confirm']);
  check('set-role rejects an unknown account', c1.status !== 0);
  c1 = cli(['not-an-email', 'staff', '--confirm']);
  check('set-role rejects an invalid email', c1.status !== 0);
  c1 = cli([s.email, 'staff', '--confirm']);
  check('set-role --confirm applies the change', c1.status === 0 && roleOf(s.id) === 'staff', c1.out);
  const al = db.prepare("SELECT actor_id, detail FROM AuditLog WHERE action = 'role.change' AND target_id = ? ORDER BY id DESC").get(s.id);
  check('role change written to AuditLog (no actor, via cli)',
    al && al.actor_id === null && JSON.parse(al.detail).via === 'cli' && JSON.parse(al.detail).to === 'staff');
  check('set-role output never contains a password hash', !/\$2[aby]\$/.test(c1.out));

  const m = await newMember('mgr');
  c1 = cli([m.email, 'manager', '--confirm']);
  const managerCount = db.prepare("SELECT COUNT(*) AS n FROM Users WHERE role = 'manager' AND is_active = 1").get().n;
  check('exactly one active manager exists for the guard test', c1.status === 0 && managerCount === 1, `managers: ${managerCount}`);
  c1 = cli([m.email, 'member', '--confirm']);
  check('the last manager cannot be demoted', c1.status !== 0 && roleOf(m.id) === 'manager', c1.out);

  // ---------- cleanup ----------
  try {
    if (createdIds.length) {
      const marks = createdIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM AuditLog WHERE target_type = 'user' AND target_id IN (${marks})`).run(...createdIds);
      db.prepare(`DELETE FROM Users WHERE id IN (${marks})`).run(...createdIds);
    }
    db.prepare("DELETE FROM Announcements WHERE title LIKE 'roletest %'").run();
  } catch (e) {
    console.log('  (cleanup skipped: test rows left in the database)');
  }

  console.log(`\nRole tests: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
