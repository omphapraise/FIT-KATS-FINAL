const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeToken(userId) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  return jwt.sign({ id: userId }, secret, { expiresIn: '7d' });
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    membership_tier: row.membership_tier,
    membership_expiry: row.membership_expiry,
    loyalty_points: row.loyalty_points,
  };
}

// POST /register  (always creates a plain member; any "role" in the body is ignored)
router.post('/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const displayName = String(req.body.display_name || '').trim();

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  if (displayName.length < 2 || displayName.length > 40) {
    return res.status(400).json({ success: false, message: 'Display name must be 2 to 40 characters' });
  }

  const existing = db.prepare('SELECT id FROM Users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);

  // Create the user AND their settings row together
  const create = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO Users (email, password, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(email, hash, displayName, new Date().toISOString());
    db.prepare('INSERT INTO Settings (user_id, notifications_enabled) VALUES (?, 1)')
      .run(result.lastInsertRowid);
    return result.lastInsertRowid;
  });

  const userId = create();
  const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token: makeToken(userId),
    user: publicUser(user),
  });
});

// POST /login
router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please enter your email and password' });
  }

  const user = db.prepare('SELECT * FROM Users WHERE email = ?').get(email);

  // Same message for both cases so we don't reveal which emails exist
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ success: false, message: 'Incorrect email or password' });
  }

  // Only checked AFTER a correct password, so it never reveals which emails exist
  if (user.is_active !== 1) {
    return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the gym.' });
  }

  res.json({
    success: true,
    message: 'Login successful',
    token: makeToken(user.id),
    user: publicUser(user),
  });
});

module.exports = router;
