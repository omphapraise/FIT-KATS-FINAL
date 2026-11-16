const db = require('./db');
const referrals = require('./referrals');

const REPEAT_WINDOW_MINUTES = 5;                       // same member can't be checked in twice inside this
const CHECKIN_SOURCES = ['qr', 'manual', 'staff_qr'];  // qr = kiosk, manual = staff typed, staff_qr = staff scanned

// 'active' | 'expired' | 'unknown'
function membershipStatus(expiry) {
  if (!expiry) return 'unknown';
  const s = String(expiry).trim();
  const end = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T23:59:59') : new Date(s);
  if (Number.isNaN(end.getTime())) return 'unknown';
  return end.getTime() >= Date.now() ? 'active' : 'expired';
}

function membershipProblem(status) {
  if (status === 'expired') return 'Your membership has expired. Renew to check in.';
  if (status === 'unknown') return "We couldn't read your membership expiry. Please contact the gym.";
  return null;
}

// Needs: is_active, verification_status, membership_expiry. Returns a message or null.
function eligibilityProblem(user) {
  if (user.is_active !== 1) return 'This account is not active. Please contact the gym.';
  if (user.verification_status === 'pending') return 'Your sign-up is awaiting verification at the front desk.';
  if (user.verification_status === 'rejected') return 'Your sign-up could not be verified. Please contact the gym.';
  return membershipProblem(membershipStatus(user.membership_expiry));
}

// The ONE place a check-in is written. Returns { ok, status, message, data }.
function performCheckin({ userId, source, checkedInBy = null }) {
  if (!CHECKIN_SOURCES.includes(source)) {
    throw new Error(`Invalid check-in source: ${source}`);
  }

  const user = db
    .prepare(`SELECT id, display_name, membership_tier, membership_expiry, is_active, verification_status
              FROM Users WHERE id = ?`)
    .get(userId);
  if (!user) return { ok: false, status: 404, message: 'Member not found' };

  const problem = eligibilityProblem(user);
  if (problem) return { ok: false, status: 403, message: problem };

  const now = new Date();
  const since = new Date(now.getTime() - REPEAT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const result = db.transaction(() => {
    const recent = db
      .prepare('SELECT checked_in_at FROM CheckIns WHERE user_id = ? AND checked_in_at >= ? ORDER BY id DESC LIMIT 1')
      .get(user.id, since);
    if (recent) return { repeat: true };
    db.prepare('INSERT INTO CheckIns (user_id, checked_in_at, source, checked_in_by) VALUES (?, ?, ?, ?)')
      .run(user.id, nowIso, source, checkedInBy);
    // Pays a pending referral (if any) in the same transaction as the check-in
    referrals.rewardOnFirstCheckin(user.id);
    return { repeat: false };
  })();

  if (result.repeat) {
    return {
      ok: false,
      status: 409,
      message: `Already checked in within the last ${REPEAT_WINDOW_MINUTES} minutes`,
    };
  }

  return {
    ok: true,
    status: 200,
    message: `Welcome, ${user.display_name}`,
    data: {
      display_name: user.display_name,
      membership_tier: user.membership_tier,
      checked_in_at: nowIso,
    },
  };
}

module.exports = {
  REPEAT_WINDOW_MINUTES,
  CHECKIN_SOURCES,
  membershipStatus,
  membershipProblem,
  eligibilityProblem,
  performCheckin,
};
