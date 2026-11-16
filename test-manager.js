require('dotenv').config();
const db = require('./src/db');

const BASE = process.env.API_URL;
if (!BASE) {
  console.error('API_URL is required');
  process.exit(2);
}
const RUN = Date.now().toString(36);
const EMAIL_LIKE = 'managertest-%@fitkats.com';
const FROM = '2001-03-01';
const TO = '2001-03-03';
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
  const res = await fetch(BASE + path, { method, headers, body: sendBody ? JSON.stringify(o.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json };
}

function userIds() {
  return db.prepare('SELECT id FROM Users WHERE email LIKE ?').all(EMAIL_LIKE).map((r) => r.id);
}

function cleanup() {
  const ids = userIds();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM CheckIns WHERE user_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM Payments WHERE user_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM Reports WHERE user_id IN (${ph})`).run(...ids);
  }
  db.prepare("DELETE FROM Classes WHERE title LIKE 'ManagerTest %'").run();
  db.prepare('DELETE FROM Users WHERE email LIKE ?').run(EMAIL_LIKE);
}

async function newUser(tag, role) {
  const email = `managertest-${tag}-${RUN}@fitkats.com`;
  const r = await call('POST', '/register', {
    body: { email, password: 'Password123', display_name: `ManagerTest ${tag}` },
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
function tierCount(o, name) {
  const t = o.tiers.find((x) => x.tier === name);
  return t ? t.count : 0;
}
const dayOf = (rows, d, key) => { const r = rows.find((x) => x.date === d); return r ? r[key] : undefined; };

async function main() {
  cleanup();

  const mgr = await newUser('mgr', 'manager');
  const staff = await newUser('staff', 'staff');
  const plain = await newUser('plain', 'member'); // active Silver until the snapshot is taken

  // ---- access control ----
  const paths = ['/manager/overview', '/manager/membership', '/manager/revenue', '/manager/attendance', '/manager/maintenance', '/manager/staff'];
  for (const p of paths) {
    let r = await call('GET', p);
    check(`no token -> 401 ${p}`, r.status === 401, r.status);
    r = await call('GET', p, { token: plain.token });
    check(`member blocked ${p}`, r.status === 403, r.status);
    r = await call('GET', p, { token: staff.token });
    check(`staff blocked ${p}`, r.status === 403, r.status);
    r = await call('GET', p, { token: mgr.token });
    check(`manager allowed ${p}`, r.status === 200 && r.json.success === true, r.status);
  }

  // ---- overview: deltas against a snapshot ----
  let r = await call('GET', '/manager/overview', { token: mgr.token });
  const before = r.json.data;
  const m0 = before.members;
  check('overview status counts add up to total',
    m0.total === m0.active + m0.expired + m0.pending + m0.rejected + m0.deactivated, m0);
  check('overview total equals members in the DB',
    m0.total === db.prepare("SELECT COUNT(*) AS n FROM Users WHERE role = 'member'").get().n, m0.total);
  check('overview today is SA today', before.today === saToday(), before.today);

  db.prepare("UPDATE Users SET membership_tier = 'Gold' WHERE id = ?").run(plain.id);
  const memE = await newUser('expired', 'member');
  db.prepare("UPDATE Users SET membership_expiry = '2000-01-01' WHERE id = ?").run(memE.id);
  const memP = await newUser('pending', 'member');
  db.prepare("UPDATE Users SET verification_status = 'pending', membership_expiry = '1970-01-01' WHERE id = ?").run(memP.id);
  const memR = await newUser('rejected', 'member');
  db.prepare("UPDATE Users SET verification_status = 'rejected' WHERE id = ?").run(memR.id);

  r = await call('GET', '/manager/overview', { token: mgr.token });
  const after = r.json.data;
  const m1 = after.members;
  check('overview total +3', m1.total === m0.total + 3, [m0.total, m1.total]);
  check('overview expired +1', m1.expired === m0.expired + 1);
  check('overview pending +1', m1.pending === m0.pending + 1);
  check('overview rejected +1', m1.rejected === m0.rejected + 1);
  check('overview active unchanged', m1.active === m0.active);
  check('tier Gold +1 and Silver -1 (active members only)',
    tierCount(after, 'Gold') === tierCount(before, 'Gold') + 1 && tierCount(after, 'Silver') === tierCount(before, 'Silver') - 1);
  const todayCount = db.prepare("SELECT COUNT(*) AS n FROM CheckIns WHERE date(checked_in_at, '+2 hours') = ?").get(saToday()).n;
  check('overview check-ins today match SQL', after.checkins.today === todayCount, [after.checkins.today, todayCount]);
  const weekCount = db.prepare("SELECT COUNT(*) AS n FROM CheckIns WHERE date(checked_in_at, '+2 hours') >= ? AND date(checked_in_at, '+2 hours') <= ?")
    .get(plusDays(saToday(), -6), saToday()).n;
  check('overview check-ins 7 days match SQL', after.checkins.last_7_days === weekCount, [after.checkins.last_7_days, weekCount]);
  check('overview reports and classes are numbers',
    Number.isInteger(after.reports.open) && Number.isInteger(after.reports.in_progress) && Number.isInteger(after.classes_upcoming));

  // ---- membership matrix ----
  r = await call('GET', '/manager/membership', { token: mgr.token });
  const matrixTotal = r.json.data.tiers.reduce((s, t) => s + t.total, 0);
  check('membership matrix total equals overview total', matrixTotal === m1.total, [matrixTotal, m1.total]);
  check('membership rows carry the status columns',
    r.json.data.tiers.every((t) => ['active', 'expired', 'pending', 'rejected', 'deactivated'].every((k) => Number.isInteger(t[k]))));

  // ---- date range validation ----
  for (const q of ['from=2001-13-01', 'to=nope', 'from=2001-03-05&to=2001-03-01', 'from=2000-01-01&to=2026-01-01']) {
    r = await call('GET', `/manager/revenue?${q}`, { token: mgr.token });
    check(`bad range -> 400 (${q})`, r.status === 400, r.status);
  }
  r = await call('GET', '/manager/attendance?from=2001-03-05&to=2001-03-01', { token: mgr.token });
  check('attendance bad range -> 400', r.status === 400, r.status);
  r = await call('GET', '/manager/maintenance?from=abc', { token: mgr.token });
  check('maintenance bad range -> 400', r.status === 400, r.status);
  r = await call('GET', '/manager/revenue', { token: mgr.token });
  check('default range is the last 30 days', r.status === 200 && r.json.data.to === saToday() && r.json.data.from === plusDays(saToday(), -29), r.json && r.json.data);

  // ---- revenue (controlled rows in 2001) ----
  const pay = db.prepare('INSERT INTO Payments (user_id, amount, status, date, is_demo, provider, payment_type) VALUES (?, ?, ?, ?, ?, NULL, ?)');
  pay.run(plain.id, 499, 'Paid', '2001-03-01', 1, 'membership');
  pay.run(plain.id, 200, 'Paid', '2001-03-01', 1, 'signup_fee');
  pay.run(plain.id, 50, 'Paid', '2001-03-02', 0, 'membership');
  pay.run(plain.id, 899, 'Pending', '2001-03-02', 1, 'membership');
  pay.run(plain.id, 100, 'Failed', '2001-03-03', 1, 'membership');
  r = await call('GET', `/manager/revenue?from=${FROM}&to=${TO}`, { token: mgr.token });
  const rv = r.json.data;
  check('revenue paid total 749', rv.totals.paid === 749, rv.totals);
  check('revenue pending 899 and failed 100', rv.totals.pending === 899 && rv.totals.failed === 100, rv.totals);
  check('revenue counts 3 paid, 1 pending, 1 failed', rv.counts.paid === 3 && rv.counts.pending === 1 && rv.counts.failed === 1, rv.counts);
  check('revenue by_day', dayOf(rv.by_day, '2001-03-01', 'paid') === 699 && dayOf(rv.by_day, '2001-03-02', 'paid') === 50 && rv.by_day.length === 2, rv.by_day);
  const mem = rv.by_type.find((t) => t.payment_type === 'membership');
  const fee = rv.by_type.find((t) => t.payment_type === 'signup_fee');
  check('revenue by_type', mem && mem.paid === 549 && mem.count === 2 && fee && fee.paid === 200 && fee.count === 1, rv.by_type);
  check('revenue carries the demo notice', typeof r.json.notice === 'string' && r.json.notice.length > 0);
  check('revenue all_demo false when a non-demo row exists', rv.all_demo === false);
  const sqlPaid = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM Payments WHERE status = 'Paid' AND substr(date,1,10) BETWEEN ? AND ?").get(FROM, TO).t;
  check('revenue paid total matches SQL', sqlPaid === rv.totals.paid, [sqlPaid, rv.totals.paid]);
  r = await call('GET', '/manager/revenue?from=1990-01-01&to=1990-01-31', { token: mgr.token });
  check('empty range gives zeros, no notice', r.status === 200 && r.json.data.totals.paid === 0 && r.json.data.by_day.length === 0 && r.json.notice === null, r.json);

  // ---- attendance (controlled rows in 2001) ----
  const ci = db.prepare('INSERT INTO CheckIns (user_id, checked_in_at, source, checked_in_by) VALUES (?, ?, ?, ?)');
  ci.run(plain.id, '2001-03-01 10:00:00', 'qr', null);
  ci.run(memE.id, '2001-03-01 11:00:00', 'manual', staff.id);
  ci.run(plain.id, '2001-03-02 09:00:00', 'staff_qr', staff.id);
  const cl = db.prepare('INSERT INTO Classes (title, description, coach, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?, ?, ?)');
  const c1 = Number(cl.run(`ManagerTest A ${RUN}`, 'Test', 'Coach', '2001-03-02T08:00:00.000Z', '2001-03-02T09:00:00.000Z', 10).lastInsertRowid);
  const c2 = Number(cl.run(`ManagerTest B ${RUN}`, 'Test', 'Coach', '2001-03-02T10:00:00.000Z', '2001-03-02T11:00:00.000Z', 20).lastInsertRowid);
  db.prepare('UPDATE Classes SET is_cancelled = 1 WHERE id = ?').run(c2);
  const bk = db.prepare("INSERT INTO Bookings (class_id, user_id, status) VALUES (?, ?, 'Confirmed')");
  bk.run(c1, plain.id);
  bk.run(c1, memE.id);
  bk.run(c2, plain.id);
  r = await call('GET', `/manager/attendance?from=${FROM}&to=${TO}`, { token: mgr.token });
  const at = r.json.data;
  check('attendance total 3, unique 2', at.total === 3 && at.unique_members === 2, at);
  check('attendance by_day', dayOf(at.by_day, '2001-03-01', 'count') === 2 && dayOf(at.by_day, '2001-03-02', 'count') === 1 && at.by_day.length === 2, at.by_day);
  const src = (s) => { const x = at.by_source.find((y) => y.source === s); return x ? x.count : 0; };
  check('attendance by_source', src('qr') === 1 && src('manual') === 1 && src('staff_qr') === 1, at.by_source);
  check('attendance classes exclude cancelled', at.classes.count === 1 && at.classes.capacity === 10 && at.classes.booked === 2, at.classes);
  check('attendance fill rate 0.2', at.classes.fill_rate === 0.2, at.classes.fill_rate);
  r = await call('GET', '/manager/attendance?from=1990-01-01&to=1990-01-31', { token: mgr.token });
  check('empty attendance range: zeros and null fill rate', r.status === 200 && r.json.data.total === 0 && r.json.data.classes.fill_rate === null, r.json && r.json.data);

  // ---- maintenance (controlled rows in 2001) ----
  const rp = db.prepare('INSERT INTO Reports (user_id, description, status, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  rp.run(plain.id, 'ManagerTest resolved high', 'Resolved', 'High', '2001-03-01 08:00:00', '2001-03-01 20:00:00');
  rp.run(plain.id, 'ManagerTest resolved low', 'Resolved', 'Low', '2001-03-02 08:00:00', '2001-03-03 08:00:00');
  rp.run(plain.id, 'ManagerTest open unrated', 'Open', null, '2001-03-03 08:00:00', null);
  r = await call('GET', `/manager/maintenance?from=${FROM}&to=${TO}`, { token: mgr.token });
  const mt = r.json.data;
  check('maintenance total 3', mt.total === 3, mt);
  check('maintenance by_status', mt.by_status.Resolved === 2 && mt.by_status.Open === 1 && mt.by_status['In Progress'] === 0, mt.by_status);
  check('maintenance by_severity', mt.by_severity.High === 1 && mt.by_severity.Low === 1 && mt.by_severity.Unrated === 1 && mt.by_severity.Medium === 0, mt.by_severity);
  check('maintenance average resolution 18 hours', mt.resolved_count === 2 && Math.abs(mt.avg_resolution_hours - 18) < 0.2, [mt.resolved_count, mt.avg_resolution_hours]);
  const openAll = db.prepare("SELECT COUNT(*) AS n FROM Reports WHERE status = 'Open'").get().n;
  check('maintenance backlog matches SQL', mt.backlog.open === openAll, [mt.backlog.open, openAll]);
  r = await call('GET', '/manager/maintenance?from=1990-01-01&to=1990-01-31', { token: mgr.token });
  check('empty maintenance range: null average', r.status === 200 && r.json.data.total === 0 && r.json.data.avg_resolution_hours === null, r.json && r.json.data);

  // ---- staff directory ----
  r = await call('GET', '/manager/staff', { token: mgr.token });
  const ids = r.json.data.map((x) => x.id);
  check('staff directory lists staff and manager, not members',
    ids.includes(staff.id) && ids.includes(mgr.id) && !ids.includes(plain.id), ids);
  check('staff directory has no password field', !JSON.stringify(r.json).includes('"password"'));
  check('staff directory rows have role, is_active boolean and open_reports',
    r.json.data.every((x) => (x.role === 'staff' || x.role === 'manager') && typeof x.is_active === 'boolean' && Number.isInteger(x.open_reports)));
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
    console.log(`Manager tests: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
