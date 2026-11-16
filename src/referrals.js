const crypto = require('crypto');
const db = require('./db');

const REFERRER_POINTS = 50;   // paid to the member who shared the code
const REFERRED_POINTS = 25;   // paid to the new member
const MONTHLY_CAP = 5;        // rewarded referrals per referrer per SA calendar month

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function saNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // South Africa = UTC+2, no DST
}
const saDate = () => saNow().slice(0, 10);
const saMonth = () => saNow().slice(0, 7);

function makeCode() {
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// Returns the member's code, creating it the first time
function ensureCode(userId) {
  const read = () => db.prepare('SELECT referral_code FROM Users WHERE id = ?').get(userId);
  const row = read();
  if (row && row.referral_code) return row.referral_code;

  for (let i = 0; i < 10; i++) {
    try {
      db.prepare('UPDATE Users SET referral_code = ? WHERE id = ? AND referral_code IS NULL')
        .run(makeCode(), userId);
      const after = read();
      if (after && after.referral_code) return after.referral_code;
    } catch (e) {
      // unique clash with another member's code: try a new one
    }
  }
  throw new Error('Could not create a referral code');
}

function rewardedThisMonth(referrerId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM Referrals
    WHERE referrer_id = ? AND status = 'rewarded'
      AND substr(datetime(rewarded_at, '+2 hours'), 1, 7) = ?`).get(referrerId, saMonth()).n;
}

// Ledger row + cached balance, always together
function addPoints(userId, points, ref) {
  db.prepare(`INSERT INTO LoyaltyTransactions (user_id, points, reason, ref, award_day)
              VALUES (?, ?, 'REFERRAL', ?, ?)`).run(userId, points, ref, saDate());
  db.prepare('UPDATE Users SET loyalty_points = loyalty_points + ? WHERE id = ?').run(points, userId);
}

// Call INSIDE the check-in transaction, right after the CheckIns row is saved.
// Pays out only if this member has a pending referral. Returns null or { status }.
function rewardOnFirstCheckin(userId) {
  const ref = db.prepare(
    "SELECT id, referrer_id, referred_id FROM Referrals WHERE referred_id = ? AND status = 'pending'"
  ).get(userId);
  if (!ref) return null;

  if (rewardedThisMonth(ref.referrer_id) >= MONTHLY_CAP) {
    db.prepare("UPDATE Referrals SET status = 'capped' WHERE id = ?").run(ref.id);
    return { status: 'capped' };
  }

  addPoints(ref.referrer_id, REFERRER_POINTS, `referral:${ref.referred_id}`);
  addPoints(ref.referred_id, REFERRED_POINTS, `welcome:${ref.id}`);
  db.prepare("UPDATE Referrals SET status = 'rewarded', rewarded_at = ? WHERE id = ?")
    .run(new Date().toISOString(), ref.id);
  return { status: 'rewarded' };
}

module.exports = {
  REFERRER_POINTS,
  REFERRED_POINTS,
  MONTHLY_CAP,
  ensureCode,
  rewardedThisMonth,
  rewardOnFirstCheckin,
};