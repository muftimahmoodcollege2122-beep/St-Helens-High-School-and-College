const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KNOWN_PUBLIC_FALLBACK = 'sthelens-shhs-fallback-secret-key-change-in-production';

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set.');
    console.error('   This repo is public on GitHub — using the old hardcoded fallback secret');
    console.error('   would let anyone forge valid admin/teacher login tokens.');
    console.error('   Set JWT_SECRET on your hosting platform to a long random string and redeploy.');
    process.exit(1);
  }
  // Dev fallback: generate a random secret and persist it locally (gitignored)
  // so tokens survive nodemon restarts but are never the known public value.
  const cachePath = path.join(__dirname, '..', '.dev-jwt-secret');
  try {
    JWT_SECRET = fs.readFileSync(cachePath, 'utf8').trim();
    if (!JWT_SECRET) throw new Error('empty');
  } catch {
    JWT_SECRET = crypto.randomBytes(48).toString('hex');
    try { fs.writeFileSync(cachePath, JWT_SECRET, 'utf8'); } catch {}
  }
  console.warn('⚠️  JWT_SECRET not set — using a random dev-only secret (not the old public fallback).');
  console.warn('⚠️  Set JWT_SECRET in your environment before deploying to production.');
}

if (JWT_SECRET === KNOWN_PUBLIC_FALLBACK) {
  console.error('❌ FATAL: JWT_SECRET is set to the old publicly-known fallback value. Change it immediately.');
  process.exit(1);
}

module.exports = { JWT_SECRET };
