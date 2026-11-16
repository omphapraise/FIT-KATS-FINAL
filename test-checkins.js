require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('./src/db');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const SECRET = process.env.JWT_SECRET || 'dev_secret';
const KIOSK_KEY = process.env.KIOSK_KEY || '';

let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`);
  }
}

async function call(method, path, { token, kioskKey, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (kioskKey !== undefined) headers['x-kiosk-key'] = kioskKey;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch (e) { /* non-JSON body */ }
  return { status: res.status, json };
}

async function main() {
  console.log(`Check-in tests against ${BASE}`);

  if (KIOSK_KEY.length < 16) {
    console.log('  FAIL  KIOSK_KEY missing or shorter than 16 chars in backend\\.env');
    process.exit(1);
  }

  const health = await call('GET', '/health');
  check('server is up', health.status === 200, `status ${health.status}`);

  // Fresh member for this run
  const email = `checkin_${Date.now()}@test.local`;
  const reg = await call('POST', '/register', {
    body: { email, password: 'Password123', display_name: 'Check In Test' },
  });
  check('test member registered', reg.status === 200 || reg.status === 201, `status ${reg.status}`);
  const loginToken = reg.json.token;
  const userId = reg.json.user && reg.json.user.id;
  if (!loginToken || !userId) {
    console.log('  Cannot continue without a registered test member.');
    process.exit(1);
  }

  // Give the test member a long membership (assumes YYYY-MM-DD expiry text)
  db.prepare('UPDATE Users SET membership_expiry = ? WHERE id = ?').run('2099-12-31', userId);

  // ---- token endpoint ----
  const noAuth = await call('GET', '/checkin-token');
  check('GET /checkin-token without login -> 401', noAuth.status === 401);

  const tok = await call('GET', '/checkin-token', { token: loginToken });
  check('GET /checkin-token with login -> 200', tok.status === 200, `status ${tok.status}`);
  const qrToken = tok.json.data && tok.json.data.token;
  check('token returned', typeof qrToken === 'string' && qrToken.length > 20);
  check('token lives 60 seconds', tok.json.data && tok.json.data.expires_in === 60);

  // ---- isolation: check-in token must NOT work as a login token ----
  const asLogin = await call('GET', '/profile', { token: qrToken });
  check('check-in token rejected as login token -> 401', asLogin.status === 401, `status ${asLogin.status}`);

  // ---- kiosk key rules ----
  const noKey = await call('POST', '/checkins', { body: { token: qrToken } });
  check('scan without kiosk key -> 401', noKey.status === 401, `status ${noKey.status}`);

  const badKey = await call('POST', '/checkins', { kioskKey: 'x'.repeat(KIOSK_KEY.length), body: { token: qrToken } });
  check('scan with wrong kiosk key -> 401', badKey.status === 401, `status ${badKey.status}`);

  // ---- bad tokens ----
  const noTok = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: {} });
  check('scan with no token -> 400', noTok.status === 400, `status ${noTok.status}`);

  const garbage = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: 'not.a.token' } });
  check('scan with garbage token -> 400', garbage.status === 400, `status ${garbage.status}`);

  const loginAsQr = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: loginToken } });
  check('login JWT used as QR token -> 400', loginAsQr.status === 400, `status ${loginAsQr.status}`);

  const expiredTok = jwt.sign({ id: userId, type: 'checkin' }, SECRET + ':checkin', { expiresIn: -10 });
  const expired = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: expiredTok } });
  check('expired QR token -> 400', expired.status === 400, `status ${expired.status}`);

  // ---- happy path + repeat scan ----
  const ok = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: qrToken } });
  check('valid scan -> 200', ok.status === 200, `status ${ok.status} ${ok.json.message || ''}`);
  check('scan saved a CheckIns row',
    db.prepare('SELECT COUNT(*) AS n FROM CheckIns WHERE user_id = ?').get(userId).n === 1);

  const again = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: qrToken } });
  check('repeat scan within 5 minutes -> 409', again.status === 409, `status ${again.status}`);
  check('still only one CheckIns row',
    db.prepare('SELECT COUNT(*) AS n FROM CheckIns WHERE user_id = ?').get(userId).n === 1);

  // ---- busy ----
  const busyNoAuth = await call('GET', '/gym/busy');
  check('GET /gym/busy without login -> 401', busyNoAuth.status === 401);
  const busy = await call('GET', '/gym/busy', { token: loginToken });
  check('GET /gym/busy -> 200', busy.status === 200, `status ${busy.status}`);
  check('busy count is at least 1', busy.json.data && busy.json.data.members_checked_in >= 1);

  // ---- expired membership ----
  db.prepare('UPDATE Users SET membership_expiry = ? WHERE id = ?').run('2000-01-01', userId);
  const expTok = await call('GET', '/checkin-token', { token: loginToken });
  check('expired membership cannot get a token -> 403', expTok.status === 403, `status ${expTok.status}`);

  const handMade = jwt.sign({ id: userId, type: 'checkin' }, SECRET + ':checkin', { expiresIn: 60 });
  db.prepare('DELETE FROM CheckIns WHERE user_id = ?').run(userId); // so the repeat rule can't hide the result
  const expScan = await call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: handMade } });
  check('expired membership scan -> 403', expScan.status === 403, `status ${expScan.status}`);

  // ---- cleanup ----
  try {
    db.prepare('DELETE FROM CheckIns WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM Users WHERE id = ?').run(userId);
  } catch (e) {
    console.log('  (cleanup skipped: test member left in the database)');
  }

  console.log(`\nCheck-in tests: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});