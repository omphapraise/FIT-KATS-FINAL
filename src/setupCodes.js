const crypto = require('crypto');

// 31 characters, no I, L, O, 0 or 1 so a code is easy to read out loud
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out.slice(0, 5) + '-' + out.slice(5);
}

function normalise(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Only this hash is ever stored; the code itself never is.
function hashCode(code) {
  return crypto.createHash('sha256').update(normalise(code)).digest('hex');
}

module.exports = { generateCode, normalise, hashCode, CODE_LENGTH };
