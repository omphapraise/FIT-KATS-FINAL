const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

function saToday() {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // South African date
}

// GET /membership -> my tier, status, perks, and every tier for upgrade info
router.get('/membership', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT membership_tier, membership_expiry FROM Users WHERE id = ?'
  ).get(req.userId);

  const tiers = db.prepare(
    'SELECT name, price_rand, tagline, perks FROM MembershipTiers ORDER BY sort_order'
  ).all().map((t) => ({
    name: t.name,
    price_rand: t.price_rand,
    tagline: t.tagline,
    perks: JSON.parse(t.perks),
    is_current: t.name === user.membership_tier,
  }));

  const current = tiers.find((t) => t.is_current) || null;

  res.json({
    success: true,
    message: 'Membership loaded',
    data: {
      tier: user.membership_tier,
      status: user.membership_expiry >= saToday() ? 'Active' : 'Expired',
      expiry: user.membership_expiry,
      perks: current ? current.perks : [],
      tiers,
      // Upgrades are not purchasable in the app yet (needs a payment provider)
      can_upgrade_in_app: false,
      upgrade_note: 'Ask at the front desk to change your plan. Online upgrades are coming soon.',
    },
  });
});

module.exports = router;
