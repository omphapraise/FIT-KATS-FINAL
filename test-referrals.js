require('dotenv').config();
const db = require('./src/db');
const referrals = require('./src/referrals');

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
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
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

async function newMember(label) {
  const email = `ref_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;
  const r = await call('POST', '/register', { body: { email, password: 'Password123', display_name: `Ref ${label}` } });
  if (!r.json.token || !r.json.user) throw new Error(`could not register ${label} (status ${r.status})`);
  createdIds.push(r.json.user.id);
  db.prepare('UPDATE Users SET membership_expiry = ? WHERE id = ?').run('2099-12-31', r.json.user.id);
  return { token: r.json.token, id: r.json.user.id };
}

async function scan(member) {
  const t = await call('GET', '/checkin-token', { token: member.token });
  return call('POST', '/checkins', { kioskKey: KIOSK_KEY, body: { token: t.json.data && t.json.data.token } });
}

const points = (id) => db.prepare('SELECT loyalty_points FROM Users WHERE id = ?').get(id).loyalty_points;
const ledgerSum = (id) => db.prepare('SELECT COALESCE(SUM(points),0) AS s FROM LoyaltyTransactions WHERE user_id = ?').get(id).s;

async function main() {
  console.log(`Referral tests against ${BASE}`);
  if (KIOSK_KEY.length < 16) { console.log('  FAIL  KIOSK_KEY missing in backend\\.env'); process.exit(1); }

  const A = await newMember('A'); // the referrer
  const B = await newMember('B'); // new member who uses A's code
  const C = await newMember('C'); // already checked in before trying a code

  let r = await call('GET', '/referral');
  check('GET /referral without login -> 401', r.status === 401);

  r = await call('GET', '/referral', { token: A.token });
  const code = r.json.data && r.json.data.code;
  check('member gets an 8-character code', r.status === 200 && /^[A-Z0-9]{8}$/.test(code || ''), `status ${r.status}`);
  const again = await call('GET', '/referral', { token: A.token });
  check('the code stays the same on later calls', again.json.data.code === code);
  check('fresh member can enter a code', r.json.data.can_redeem === true);

  r = await call('POST', '/referral/redeem', { token: A.token, body: { code } });
  check("own code is refused -> 400", r.status === 400, `status ${r.status}`);

  r = await call('POST', '/referral/redeem', { token: B.token, body: { code: 'bad' } });
  check('badly formatted code -> 400', r.status === 400, `status ${r.status}`);

  r = await call('POST', '/referral/redeem', { token: B.token, body: { code: 'ZZZZZZZZ' } });
  check('unknown code -> 404', r.status === 404, `status ${r.status}`);

  r = await call('POST', '/referral/redeem', { body: { code } });
  check('redeem without login -> 401', r.status === 401);

  // C checks in first, then tries a code
  r = await scan(C);
  check('C checks in', r.status === 200, `status ${r.status}`);
  r = await call('POST', '/referral/redeem', { token: C.token, body: { code } });
  check('code after first check-in -> 409', r.status === 409, `status ${r.status}`);

  // B redeems (lowercase + spaces must still work)
  r = await call('POST', '/referral/redeem', { token: B.token, body: { code: `  ${code.toLowerCase()} ` } });
  check('B redeems A\'s code -> 200', r.status === 200, `status ${r.status} ${r.json.message || ''}`);
  r = await call('POST', '/referral/redeem', { token: B.token, body: { code } });
  check('B cannot redeem twice -> 409', r.status === 409, `status ${r.status}`);

  check('no points before B checks in (A)', points(A.id) === 0);
  check('no points before B checks in (B)', points(B.id) === 0);
  r = await call('GET', '/referral', { token: A.token });
  check('A sees 1 pending referral', r.json.data.pending_count === 1 && r.json.data.rewarded_count === 0);

  // B's first real check-in pays out
  r = await scan(B);
  check('B checks in', r.status === 200, `status ${r.status}`);
  check('A earned the referrer points', points(A.id) === referrals.REFERRER_POINTS, `got ${points(A.id)}`);
  check('B earned the welcome points', points(B.id) === referrals.REFERRED_POINTS, `got ${points(B.id)}`);
  check('A ledger total equals balance', ledgerSum(A.id) === points(A.id));
  check('B ledger total equals balance', ledgerSum(B.id) === points(B.id));

  r = await call('GET', '/referral', { token: A.token });
  check('A sees 1 rewarded referral', r.json.data.rewarded_count === 1 && r.json.data.pending_count === 0);
  r = await call('GET', '/referral', { token: B.token });
  check('B sees the code was rewarded', r.json.data.redeemed && r.json.data.redeemed.status === 'rewarded');

  // Repeat scan: no second payout
  r = await scan(B);
  check('repeat scan is blocked (409)', r.status === 409, `status ${r.status}`);
  check('no second payout for A', points(A.id) === referrals.REFERRER_POINTS);

  // Monthly cap: B was reward number 1; four more fill the cap; the next one is capped
  const extra = [];
  for (let i = 1; i <= referrals.MONTHLY_CAP; i++) extra.push(await newMember(`D${i}`));
  for (const m of extra) {
    const rd = await call('POST', '/referral/redeem', { token: m.token, body: { code } });
    if (rd.status !== 200) check('extra member could redeem', false, `status ${rd.status}`);
    await scan(m);
  }
  const last = extra[extra.length - 1];
  r = await call('GET', '/referral', { token: last.token });
  check('referral beyond the monthly cap is marked capped', r.json.data.redeemed && r.json.data.redeemed.status === 'capped',
    JSON.stringify(r.json.data && r.json.data.redeemed));
  check('capped referral pays the new member nothing', points(last.id) === 0);
  check('A is paid for exactly the cap', points(A.id) === referrals.MONTHLY_CAP * referrals.REFERRER_POINTS,
    `got ${points(A.id)}`);
  check('A ledger total still equals balance', ledgerSum(A.id) === points(A.id));

  // Cleanup
  try {
    for (const id of createdIds) db.prepare('DELETE FROM Users WHERE id = ?').run(id);
  } catch (e) {
    console.log('  (cleanup skipped: test members left in the database)');
  }

  console.log(`\nReferral tests: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Test run crashed:', err); process.exit(1); });