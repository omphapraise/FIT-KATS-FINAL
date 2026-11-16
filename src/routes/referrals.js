const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const referrals = require('../referrals');

const router = express.Router();

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Member';

function hasCheckedIn(userId) {
  return db.prepare('SELECT 1 FROM CheckIns WHERE user_id = ? LIMIT 1').get(userId) !== undefined;
}

// GET /referral  - my code, whether I can enter someone's code, and how my referrals are doing
router.get('/referral', requireAuth, (req, res) => {
  const code = referrals.ensureCode(req.userId);

  const mine = db.prepare(`
    SELECT r.status, r.created_at, r.rewarded_at, u.display_name
    FROM Referrals r JOIN Users u ON u.id = r.referred_id
    WHERE r.referrer_id = ?
    ORDER BY r.id DESC LIMIT 50`).all(req.userId);

  const redeemedRow = db.prepare(`
    SELECT r.status, r.created_at, u.display_name AS referrer_name
    FROM Referrals r JOIN Users u ON u.id = r.referrer_id
    WHERE r.referred_id = ?`).get(req.userId);

  const count = (s) => mine.filter((m) => m.status === s).length;
  const rewarded = count('rewarded');

  let canRedeem = true;
  let reason = null;
  if (redeemedRow) { canRedeem = false; reason = 'You have already entered a referral code.'; }
  else if (hasCheckedIn(req.userId)) { canRedeem = false; reason = 'Codes can only be entered before your first check-in.'; }

  res.json({
    success: true,
    message: 'Referral info loaded',
    data: {
      code,
      referrer_points: referrals.REFERRER_POINTS,
      referred_points: referrals.REFERRED_POINTS,
      monthly_cap: referrals.MONTHLY_CAP,
      rewarded_this_month: referrals.rewardedThisMonth(req.userId),
      can_redeem: canRedeem,
      cannot_redeem_reason: reason,
      redeemed: redeemedRow
        ? { status: redeemedRow.status, referrer_name: firstName(redeemedRow.referrer_name), created_at: redeemedRow.created_at }
        : null,
      pending_count: count('pending'),
      rewarded_count: rewarded,
      capped_count: count('capped'),
      points_earned: rewarded * referrals.REFERRER_POINTS,
      referrals: mine.map((m) => ({
        name: firstName(m.display_name),
        status: m.status,
        created_at: m.created_at,
        rewarded_at: m.rewarded_at,
      })),
    },
  });
});

// POST /referral/redeem  { code }
router.post('/referral/redeem', requireAuth, (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Enter the 8-character referral code' });
  }

  const referrer = db.prepare('SELECT id FROM Users WHERE referral_code = ?').get(code);
  if (!referrer) {
    return res.status(404).json({ success: false, message: 'That referral code was not found' });
  }
  if (referrer.id === req.userId) {
    return res.status(400).json({ success: false, message: "You can't use your own referral code" });
  }
  if (db.prepare('SELECT 1 FROM Referrals WHERE referred_id = ?').get(req.userId)) {
    return res.status(409).json({ success: false, message: 'You have already entered a referral code' });
  }
  if (hasCheckedIn(req.userId)) {
    return res.status(409).json({ success: false, message: 'Codes can only be entered before your first check-in' });
  }

  try {
    db.prepare('INSERT INTO Referrals (referrer_id, referred_id) VALUES (?, ?)').run(referrer.id, req.userId);
  } catch (err) {
    return res.status(409).json({ success: false, message: 'You have already entered a referral code' });
  }

  res.json({
    success: true,
    message: `Code accepted. You and your friend get points after your first gym check-in.`,
  });
});

module.exports = router;
