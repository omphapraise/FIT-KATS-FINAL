require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/db');
const setupCodes = require('./src/setupCodes');

const BASE = process.env.API_URL;
if (!BASE) {
  console.error('API_URL is required');
  process.exit(2);
}
const RUN = Date.now().toString(36);
const EMAIL_LIKE = 'stafftest-%@fitkats.com';
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

async function call(method, path, opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const sendBody = o.body !== undefined && method !== 'GET' && method !== 'HEAD';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: sendBody ? JSON.stringify(o.body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json };
}

function cleanup() {
  const ids = db.prepare('SELECT id FROM Users WHERE email LIKE ?').all(EMAIL_LIKE).map((r) => r.id);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM AuditLog WHERE actor_id IN (${ph}) OR (target_type = 'member' AND target_id IN (${ph}))`).run(...ids, ...ids);
  }
  db.prepare("DELETE FROM Classes WHERE title LIKE 'StaffTest %'").run();
  db.prepare("DELETE FROM Announcements WHERE title LIKE 'StaffTest %'").run();
  db.prepare('DELETE FROM Users WHERE email LIKE ?').run(EMAIL_LIKE);
}

async function newUser(tag, role) {
  const email = `stafftest-${tag}-${RUN}@fitkats.com`;
  const r = await call('POST', '/register', {
    body: { email, password: 'Password123', display_name: `StaffTest ${tag}` },
  });
  const row = db.prepare('SELECT id FROM Users WHERE email = ?').get(email);
  if (!row || !r.json || !r.json.token) throw new Error(`Could not create test user ${tag} (status ${r.status})`);
  db.prepare('UPDATE Users SET role = ?, membership_expiry = ? WHERE id = ?').run(role, '2099-12-31', row.id);
  return { id: row.id, email, token: r.json.token };
}

function saToday() {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}
function plusDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function future(days, hours) {
  return new Date(Date.now() + days * 86400000 + (hours || 0) * 3600000).toISOString();
}

async function main() {
  cleanup();

  const staff = await newUser('staff', 'staff');
  const mgr = await newUser('mgr', 'manager');
  const member = await newUser('member', 'member');
  const member2 = await newUser('member2', 'member');
  const gone = await newUser('gone', 'staff');

  // ---- access control ----
  let r = await call('GET', '/staff/members');
  check('no token -> 401', r.status === 401, r.status);
  for (const [m, p] of [['GET', '/staff/members'], ['POST', '/staff/members'], ['GET', '/staff/classes'],
    ['GET', '/staff/reports'], ['GET', '/staff/announcements'], ['GET', '/staff/audit-log'],
    ['POST', '/staff/checkin/scan']]) {
    r = await call(m, p, { token: member.token, body: {} });
    check(`member blocked from ${m} ${p}`, r.status === 403, r.status);
  }
  r = await call('GET', '/staff/members', { token: staff.token });
  check('staff can list members', r.status === 200 && r.json.success === true, r.status);
  r = await call('GET', '/staff/audit-log', { token: staff.token });
  check('staff blocked from audit log', r.status === 403, r.status);
  r = await call('GET', '/staff/audit-log', { token: mgr.token });
  check('manager can read audit log', r.status === 200, r.status);
  db.prepare('UPDATE Users SET is_active = 0 WHERE id = ?').run(gone.id);
  r = await call('GET', '/staff/members', { token: gone.token });
  check('deactivated staff -> 401', r.status === 401, r.status);

  // ---- walk-in registration ----
  const walkEmailA = `stafftest-walkin-a-${RUN}@fitkats.com`;
  const walkEmailB = `stafftest-walkin-b-${RUN}@fitkats.com`;
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: 'StaffTest Walkin A', email: 'nope', membership_tier: 'Gold' } });
  check('walk-in bad email -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: 'StaffTest Walkin A', email: walkEmailA, membership_tier: 'Diamond' } });
  check('walk-in bad tier -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: 'StaffTest Walkin A', email: walkEmailA, phone: 'abc', membership_tier: 'Gold' } });
  check('walk-in bad phone -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: `StaffTest Walkin A ${RUN}`, email: walkEmailA, phone: '0821234567', membership_tier: 'Gold' } });
  check('walk-in create -> 201', r.status === 201 && r.json.success === true, r);
  const A = r.json && r.json.data ? r.json.data : {};
  const codeA = A.setup_code;
  const idA = A.member ? A.member.id : null;
  check('setup code shape', /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(String(codeA)), codeA);
  check('walk-in is pending, role-safe, no password in response',
    A.member && A.member.verification_status === 'pending' && !JSON.stringify(r.json).includes('"password"'));
  check('walk-in cannot check in yet', A.member && A.member.can_check_in === false);
  const uA = db.prepare('SELECT * FROM Users WHERE id = ?').get(idA);
  check('walk-in role member, placeholder expiry, created_at set',
    uA && uA.role === 'member' && uA.membership_expiry === '1970-01-01' && !!uA.created_at, uA && uA.membership_expiry);
  check('walk-in password is an unusable hash, not the code',
    uA && uA.password !== codeA && !bcrypt.compareSync(String(codeA), uA.password));
  check('walk-in Settings row exists', !!db.prepare('SELECT 1 FROM Settings WHERE user_id = ?').get(idA));
  const fee = db.prepare("SELECT * FROM Payments WHERE user_id = ? AND payment_type = 'signup_fee'").get(idA);
  check('signup fee R200 Pending demo', fee && fee.amount === 200 && fee.status === 'Pending' && fee.is_demo === 1, fee);
  const setupRow = db.prepare('SELECT * FROM PasswordSetups WHERE user_id = ?').get(idA);
  check('only code hash stored, created_by staff, open',
    setupRow && setupRow.code_hash === setupCodes.hashCode(codeA) && setupRow.created_by === staff.id && !setupRow.used_at && !setupRow.revoked_at);
  check('code itself not stored', !db.prepare('SELECT 1 FROM PasswordSetups WHERE code_hash = ?').get(String(codeA)));
  check('audit member.walkin_registered written',
    !!db.prepare("SELECT 1 FROM AuditLog WHERE action = 'member.walkin_registered' AND target_id = ? AND actor_id = ?").get(idA, staff.id));
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: 'StaffTest Walkin Dup', email: walkEmailA.toUpperCase(), membership_tier: 'Silver' } });
  check('walk-in duplicate email -> 409', r.status === 409, r.status);
  r = await call('POST', '/login', { body: { email: walkEmailA, password: 'Password123' } });
  check('walk-in cannot log in before setting a password', r.status === 401, r.status);

  // ---- pending cannot check in ----
  r = await call('POST', `/staff/members/${idA}/checkin`, { token: staff.token });
  check('pending manual check-in -> 403', r.status === 403, r.status);

  // ---- reissue ----
  r = await call('POST', `/staff/members/${idA}/setup-code`, { token: staff.token });
  check('reissue -> 200 with new code', r.status === 200 && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(String(r.json.data.setup_code)) && r.json.data.setup_code !== codeA, r.status);
  const oldRow = db.prepare('SELECT revoked_at FROM PasswordSetups WHERE code_hash = ?').get(setupCodes.hashCode(codeA));
  check('old code revoked', oldRow && !!oldRow.revoked_at);
  check('exactly one open code', db.prepare('SELECT COUNT(*) AS n FROM PasswordSetups WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL').get(idA).n === 1);
  r = await call('POST', `/staff/members/${staff.id}/setup-code`, { token: staff.token });
  check('reissue for a staff user -> 404', r.status === 404, r.status);
  r = await call('POST', '/staff/members/abc/setup-code', { token: staff.token });
  check('reissue bad id -> 400', r.status === 400, r.status);

  // ---- verification ----
  r = await call('POST', `/staff/members/${idA}/verify`, { token: staff.token, body: { decision: 'maybe' } });
  check('verify bad decision -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idA}/verify`, { token: staff.token, body: { decision: 'approve' } });
  check('approve without ID type -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idA}/verify`, { token: staff.token, body: { decision: 'approve', id_type: 'library_card' } });
  check('approve with bad ID type -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idA}/verify`, { token: staff.token, body: { decision: 'approve', id_type: 'sa_id' } });
  check('approve -> 200', r.status === 200 && r.json.data.member.verification_status === 'verified', r);
  const uA2 = db.prepare('SELECT verification_status, id_type_sighted, activated_at, membership_expiry FROM Users WHERE id = ?').get(idA);
  check('approved: type recorded, activated_at set, expiry = SA today + 30',
    uA2.verification_status === 'verified' && uA2.id_type_sighted === 'sa_id' && !!uA2.activated_at && uA2.membership_expiry === plusDays(saToday(), 30), uA2);
  check('signup fee flipped to Paid', db.prepare("SELECT status FROM Payments WHERE user_id = ? AND payment_type = 'signup_fee'").get(idA).status === 'Paid');
  const vAudit = db.prepare("SELECT detail FROM AuditLog WHERE action = 'member.verified' AND target_id = ?").get(idA);
  check('audit member.verified stores ID type only', vAudit && JSON.parse(vAudit.detail).id_type === 'sa_id');
  r = await call('POST', `/staff/members/${idA}/verify`, { token: staff.token, body: { decision: 'approve', id_type: 'sa_id' } });
  check('second verify -> 409', r.status === 409, r.status);

  // ---- manual check-in ----
  r = await call('POST', `/staff/members/${idA}/checkin`, { token: staff.token });
  check('approved member manual check-in -> 200', r.status === 200, r);
  let ci = db.prepare('SELECT source, checked_in_by FROM CheckIns WHERE user_id = ? ORDER BY id DESC').get(idA);
  check('manual source and checked_in_by recorded', ci && ci.source === 'manual' && ci.checked_in_by === staff.id, ci);
  r = await call('POST', `/staff/members/${idA}/checkin`, { token: staff.token });
  check('repeat manual check-in -> 409', r.status === 409, r.status);
  r = await call('POST', '/staff/members/99999999/checkin', { token: staff.token });
  check('check-in unknown member -> 404', r.status === 404, r.status);

  // ---- rejection ----
  r = await call('POST', '/staff/members', { token: staff.token, body: { display_name: `StaffTest Walkin B ${RUN}`, email: walkEmailB, membership_tier: 'Silver' } });
  check('walk-in B created without phone', r.status === 201, r.status);
  const idB = r.json.data.member.id;
  r = await call('POST', `/staff/members/${idB}/verify`, { token: staff.token, body: { decision: 'reject' } });
  check('reject without reason -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idB}/verify`, { token: staff.token, body: { decision: 'reject', reason: 'ID did not match', id_type: 'passport' } });
  check('reject -> 200', r.status === 200 && r.json.data.member.verification_status === 'rejected', r.status);
  check('rejected: fee stays Pending', db.prepare("SELECT status FROM Payments WHERE user_id = ? AND payment_type = 'signup_fee'").get(idB).status === 'Pending');
  const rAudit = db.prepare("SELECT detail FROM AuditLog WHERE action = 'member.rejected' AND target_id = ?").get(idB);
  check('audit member.rejected has reason', rAudit && JSON.parse(rAudit.detail).reason === 'ID did not match');
  r = await call('POST', `/staff/members/${idB}/checkin`, { token: staff.token });
  check('rejected check-in -> 403', r.status === 403, r.status);
  r = await call('POST', `/staff/members/${idB}/setup-code`, { token: staff.token });
  check('reissue for rejected -> 409', r.status === 409, r.status);

  // ---- staff QR scan ----
  r = await call('GET', '/checkin-token', { token: member.token });
  const qr = r.json && r.json.data ? r.json.data.token : null;
  check('member got a QR token', r.status === 200 && !!qr, r.status);
  r = await call('POST', '/staff/checkin/scan', { token: staff.token, body: {} });
  check('scan without token -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/checkin/scan', { token: staff.token, body: { token: member.token } });
  check('login token is not a valid QR token -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/checkin/scan', { token: staff.token, body: { token: qr } });
  check('staff scan -> 200', r.status === 200, r);
  ci = db.prepare('SELECT source, checked_in_by FROM CheckIns WHERE user_id = ? ORDER BY id DESC').get(member.id);
  check('staff_qr source and checked_in_by recorded', ci && ci.source === 'staff_qr' && ci.checked_in_by === staff.id, ci);
  r = await call('POST', '/staff/checkin/scan', { token: staff.token, body: { token: qr } });
  check('repeat scan -> 409', r.status === 409, r.status);
  r = await call('GET', '/staff/checkins?limit=5', { token: staff.token });
  check('recent check-ins list', r.status === 200 && r.json.count >= 1 && r.json.data[0].checked_in_by_name !== undefined, r.status);

  // ---- search and profile ----
  r = await call('GET', `/staff/members?q=${encodeURIComponent('Walkin A ' + RUN)}`, { token: staff.token });
  check('search finds walk-in A only', r.status === 200 && r.json.count === 1 && r.json.data[0].id === idA, r.json);
  r = await call('GET', `/staff/members?q=${encodeURIComponent('%')}`, { token: staff.token });
  check('LIKE wildcard is escaped', r.status === 200 && r.json.count === 0, r.json && r.json.count);
  r = await call('GET', `/staff/members?q=stafftest-staff-${RUN}`, { token: staff.token });
  check('search excludes staff accounts', r.status === 200 && r.json.count === 0, r.json && r.json.count);
  r = await call('GET', '/staff/members?status=pending&limit=100', { token: staff.token });
  check('status filter only returns pending', r.status === 200 && r.json.data.every((m) => m.verification_status === 'pending'), r.status);
  r = await call('GET', '/staff/members?status=bogus', { token: staff.token });
  check('bad status filter -> 400', r.status === 400, r.status);
  r = await call('GET', `/staff/members/${idA}`, { token: staff.token });
  check('profile loads', r.status === 200 && r.json.data.member.id === idA && Array.isArray(r.json.data.recent_checkins) && Array.isArray(r.json.data.notes) && Array.isArray(r.json.data.payments), r.status);
  check('profile has check-in, demo notice, no password',
    r.json.data.recent_checkins.length === 1 && r.json.data.payments_notice !== null && !JSON.stringify(r.json).includes('"password"'));
  r = await call('GET', `/staff/members/${staff.id}`, { token: staff.token });
  check('profile of a staff user -> 404', r.status === 404, r.status);
  r = await call('GET', '/staff/members/abc', { token: staff.token });
  check('profile bad id -> 400', r.status === 400, r.status);
  r = await call('GET', '/staff/members/99999999', { token: staff.token });
  check('profile unknown -> 404', r.status === 404, r.status);

  // ---- notes ----
  r = await call('POST', `/staff/members/${idA}/notes`, { token: staff.token, body: { note: '   ' } });
  check('empty note -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idA}/notes`, { token: staff.token, body: { note: 'x'.repeat(1001) } });
  check('1001-char note -> 400', r.status === 400, r.status);
  r = await call('POST', `/staff/members/${idA}/notes`, { token: staff.token, body: { note: 'Prefers morning classes' } });
  check('note -> 201', r.status === 201 && r.json.data.author_id === staff.id, r.status);
  r = await call('GET', `/staff/members/${idA}/notes`, { token: staff.token });
  check('notes list has note with author name', r.status === 200 && r.json.count === 1 && r.json.data[0].author_name === 'StaffTest staff', r.json);
  r = await call('POST', '/staff/members/99999999/notes', { token: staff.token, body: { note: 'hi' } });
  check('note on unknown member -> 404', r.status === 404, r.status);

  // ---- classes ----
  const title = `StaffTest Yoga ${RUN}`;
  const start = future(3, 0);
  const end = future(3, 1);
  const good = { title, description: 'Test class', coach: 'Coach Test', starts_at: start, ends_at: end, capacity: 5 };
  r = await call('POST', '/staff/classes', { token: staff.token, body: { ...good, title: '' } });
  check('class without title -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/classes', { token: staff.token, body: { ...good, ends_at: start } });
  check('class end not after start -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/classes', { token: staff.token, body: { ...good, starts_at: future(-1, 0), ends_at: future(-1, 1) } });
  check('class in the past -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/classes', { token: staff.token, body: { ...good, capacity: 0 } });
  check('class capacity 0 -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/classes', { token: staff.token, body: good });
  check('class create -> 201', r.status === 201 && r.json.data.capacity === 5 && r.json.data.is_cancelled === false, r);
  const classId = r.json.data.id;
  r = await call('POST', '/staff/classes', { token: staff.token, body: good });
  check('duplicate class -> 409', r.status === 409, r.status);
  db.prepare("INSERT INTO Bookings (class_id, user_id, status) VALUES (?, ?, 'Confirmed')").run(classId, member.id);
  db.prepare("INSERT INTO Bookings (class_id, user_id, status) VALUES (?, ?, 'Confirmed')").run(classId, member2.id);
  r = await call('GET', '/staff/classes', { token: staff.token });
  const listed = r.json.data.find((c) => c.id === classId);
  check('class list shows booked_count and spots_left', listed && listed.booked_count === 2 && listed.spots_left === 3, listed);
  r = await call('GET', `/staff/classes/${classId}/bookings`, { token: staff.token });
  check('class roster lists both members', r.status === 200 && r.json.data.bookings.length === 2, r.status);
  r = await call('PUT', `/staff/classes/${classId}`, { token: staff.token, body: { capacity: 1 } });
  check('capacity below bookings -> 409', r.status === 409, r.status);
  r = await call('PUT', `/staff/classes/${classId}`, { token: staff.token, body: { coach: 'Coach Changed', capacity: 8 } });
  check('class edit -> 200', r.status === 200 && r.json.data.coach === 'Coach Changed' && r.json.data.capacity === 8, r.status);
  r = await call('PUT', '/staff/classes/99999999', { token: staff.token, body: { capacity: 8 } });
  check('edit unknown class -> 404', r.status === 404, r.status);
  r = await call('GET', '/classes', { token: member.token });
  check('member sees the class before cancel', r.status === 200 && r.json.data.some((c) => c.id === classId));
  r = await call('POST', `/staff/classes/${classId}/cancel`, { token: staff.token });
  check('cancel class -> 200', r.status === 200 && r.json.data.is_cancelled === true, r.status);
  check('is_cancelled = 1 in DB', db.prepare('SELECT is_cancelled FROM Classes WHERE id = ?').get(classId).is_cancelled === 1);
  r = await call('POST', `/staff/classes/${classId}/cancel`, { token: staff.token });
  check('cancel twice -> 409', r.status === 409, r.status);
  r = await call('PUT', `/staff/classes/${classId}`, { token: staff.token, body: { capacity: 9 } });
  check('edit cancelled class -> 409', r.status === 409, r.status);
  r = await call('GET', '/classes', { token: member.token });
  check('member no longer sees the cancelled class', r.status === 200 && !r.json.data.some((c) => c.id === classId));

  // ---- reports ----
  r = await call('POST', '/report-issue', { token: member.token, body: { description: 'StaffTest treadmill belt slipping', location: 'Cardio', severity: 'Low' } });
  check('member files a report', r.status === 201, r.status);
  const repId = r.json.data.id;
  r = await call('GET', '/staff/reports?status=Open&limit=200', { token: staff.token });
  const rep = r.json.data.find((x) => x.id === repId);
  check('staff list shows report with reporter name', r.status === 200 && rep && rep.reporter_name === 'StaffTest member', rep);
  r = await call('GET', '/staff/reports?status=Nope', { token: staff.token });
  check('bad report status filter -> 400', r.status === 400, r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: {} });
  check('empty patch -> 400', r.status === 400, r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: { status: 'Done' } });
  check('invalid status -> 400', r.status === 400, r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: { assigned_to: member.id } });
  check('assign to a member -> 400', r.status === 400, r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: { assigned_to: staff.id, severity: 'High' } });
  check('assign to staff + severity -> 200', r.status === 200 && r.json.data.assignee_name === 'StaffTest staff' && r.json.data.severity === 'High', r);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: { status: 'In Progress' } });
  check('status In Progress -> 200', r.status === 200 && r.json.data.status === 'In Progress', r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: staff.token, body: { status: 'Resolved' } });
  check('resolve without note -> 400', r.status === 400, r.status);
  r = await call('PATCH', `/staff/reports/${repId}`, { token: mgr.token, body: { status: 'Resolved', resolution_note: 'Belt replaced' } });
  check('resolve with note -> 200', r.status === 200 && r.json.data.status === 'Resolved' && r.json.data.resolution_note === 'Belt replaced', r.status);
  r = await call('GET', `/staff/reports/${repId}`, { token: staff.token });
  check('report detail has 4 events in order', r.status === 200 && r.json.data.events.length === 4 && r.json.data.events[0].to_status === 'Open' && r.json.data.events[3].to_status === 'Resolved', r.json && r.json.data && r.json.data.events);
  check('events record actor', r.json.data.events[1].actor_id === staff.id && r.json.data.events[3].actor_id === mgr.id);
  r = await call('GET', '/reports', { token: member.token });
  check('member sees Resolved', r.status === 200 && r.json.data.some((x) => x.id === repId && x.status === 'Resolved'));
  r = await call('GET', '/staff/reports/99999999', { token: staff.token });
  check('unknown report -> 404', r.status === 404, r.status);

  // ---- announcements ----
  const annTitle = `StaffTest Notice ${RUN}`;
  r = await call('POST', '/staff/announcements', { token: staff.token, body: { title: '', body: 'x' } });
  check('announcement empty title -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/announcements', { token: staff.token, body: { title: annTitle, body: 'Pool closed Friday', is_pinned: 'yes' } });
  check('announcement bad pinned -> 400', r.status === 400, r.status);
  r = await call('POST', '/staff/announcements', { token: staff.token, body: { title: annTitle, body: 'Pool closed Friday', is_pinned: true } });
  check('announcement create -> 201', r.status === 201 && r.json.data.is_pinned === true && r.json.data.status === 'published' && r.json.data.author_id === staff.id, r);
  const annId = r.json.data.id;
  r = await call('POST', '/staff/announcements', { token: staff.token, body: { title: annTitle, body: 'again' } });
  check('announcement duplicate title -> 409', r.status === 409, r.status);
  r = await call('POST', '/staff/announcements', { token: staff.token, body: { title: annTitle + ' two', body: 'second' } });
  const annId2 = r.json.data.id;
  r = await call('GET', '/announcements', { token: member.token });
  check('member sees published announcement', r.status === 200 && r.json.data.some((a) => a.id === annId));
  r = await call('PUT', `/staff/announcements/${annId2}`, { token: staff.token, body: { title: annTitle } });
  check('edit to duplicate title -> 409', r.status === 409, r.status);
  r = await call('PUT', `/staff/announcements/${annId}`, { token: staff.token, body: { body: 'Pool closed Saturday' } });
  check('announcement edit -> 200', r.status === 200 && r.json.data.body === 'Pool closed Saturday', r.status);
  r = await call('POST', `/staff/announcements/${annId}/archive`, { token: staff.token });
  check('archive -> 200', r.status === 200 && r.json.data.status === 'archived', r.status);
  r = await call('POST', `/staff/announcements/${annId}/archive`, { token: staff.token });
  check('archive twice -> 409', r.status === 409, r.status);
  r = await call('PUT', `/staff/announcements/${annId}`, { token: staff.token, body: { body: 'late edit' } });
  check('edit archived -> 409', r.status === 409, r.status);
  r = await call('GET', '/announcements', { token: member.token });
  check('member no longer sees archived announcement', r.status === 200 && !r.json.data.some((a) => a.id === annId));
  r = await call('GET', '/staff/announcements?status=archived', { token: staff.token });
  check('staff archived list includes it', r.status === 200 && r.json.data.some((a) => a.id === annId), r.status);
  r = await call('POST', '/staff/announcements/99999999/archive', { token: staff.token });
  check('archive unknown -> 404', r.status === 404, r.status);

  // ---- audit log ----
  r = await call('GET', '/staff/audit-log?limit=200', { token: mgr.token });
  const actions = r.json.data.map((x) => x.action);
  check('audit log has walk-in, verify, reject, class, report, announcement entries',
    ['member.walkin_registered', 'member.verified', 'member.rejected', 'class.created', 'class.cancelled', 'report.updated', 'announcement.created', 'announcement.archived'].every((a) => actions.includes(a)), actions.slice(0, 20));
  r = await call('GET', '/staff/audit-log?action=member.verified&limit=200', { token: mgr.token });
  check('audit filter by action', r.status === 200 && r.json.count >= 1 && r.json.data.every((x) => x.action === 'member.verified'), r.status);
  check('audit detail is parsed JSON with actor name', r.json.data[0].detail && typeof r.json.data[0].detail === 'object' && r.json.data[0].actor_name !== undefined);
  r = await call('GET', '/staff/audit-log?limit=2', { token: mgr.token });
  check('audit limit respected', r.status === 200 && r.json.count === 2 && r.json.next_before !== null, r.status);
}

main()
  .catch((err) => {
    failed++;
    console.log('FAIL unexpected error -> ' + (err && err.stack ? err.stack : err));
  })
  .finally(() => {
    try { cleanup(); } catch (e) { failed++; console.log('FAIL cleanup -> ' + e.message); }
    const left = db.prepare('SELECT COUNT(*) AS n FROM Users WHERE email LIKE ?').get(EMAIL_LIKE).n;
    if (left !== 0) { failed++; console.log('FAIL leftover test users: ' + left); }
    console.log(`Staff tests: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
