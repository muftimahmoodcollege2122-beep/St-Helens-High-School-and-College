// ── St. Helens Password & Security Setup ───────────────────────────────────────────
// Run ONCE after npm install to set strong passwords and JWT secret.
// Usage: node server/setup-passwords.js
//
// Generates:
//   - Strong random admin password
//   - Strong random teacher password  
//   - Strong 96-char JWT secret
// Saves hashed passwords to DB and updates .env

const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const readline = require('readline');

const ENV_FILE   = path.join(__dirname, '..', '.env');
const USERS_JSON = path.join(__dirname, 'db', 'schools', 'shhs', 'users.json');
const TEACH_JSON = path.join(__dirname, 'db', 'schools', 'shhs', 'teacher-accounts.json');

// ── Password generator ────────────────────────────────────────────────────────
function genPassword(len = 16) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const syms   = '@#$!%&*';
  const all    = upper + lower + digits + syms;

  let pwd = '';
  // Guarantee at least one of each type
  const bytes = crypto.randomBytes(len + 4);
  pwd += upper[bytes[0]  % upper.length];
  pwd += lower[bytes[1]  % lower.length];
  pwd += digits[bytes[2] % digits.length];
  pwd += syms[bytes[3]   % syms.length];
  for (let i = 4; i < len; i++) pwd += all[bytes[i] % all.length];

  // Shuffle
  return pwd.split('').sort(() => crypto.randomBytes(1)[0] - 128).join('');
}

// ── JWT secret generator ──────────────────────────────────────────────────────
function genJWT() {
  return crypto.randomBytes(48).toString('hex');
}

// ── Update .env ───────────────────────────────────────────────────────────────
function updateEnv(newSecret) {
  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  if (/^JWT_SECRET=/m.test(env)) {
    env = env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${newSecret}`);
  } else {
    env += `\nJWT_SECRET=${newSecret}\n`;
  }
  fs.writeFileSync(ENV_FILE, env, 'utf8');
}

// ── Update users.json ─────────────────────────────────────────────────────────
async function updateAdminPassword(hash) {
  // Try SQLite first, fall back to JSON
  try {
    const { db } = require('./db/index');
    const row = db.prepare("SELECT json_data FROM documents WHERE collection='users' LIMIT 1").get();
    if (row) {
      const users = JSON.parse(db.prepare("SELECT json_data FROM documents WHERE collection='users'").all().map(r=>r.json_data).join(',').replace(/^(.*)$/s, '[$1]') || '[]');
      // Use writeDB
      const { writeDB, readDB } = require('./db/index');
      const all = readDB('users');
      if (all.length) {
        all[0].password = hash;
        all[0].updatedAt = new Date().toISOString();
        writeDB('users', all);
        return;
      }
    }
  } catch (_) {}

  // Fallback: update JSON file directly
  if (fs.existsSync(USERS_JSON)) {
    const users = JSON.parse(fs.readFileSync(USERS_JSON, 'utf8'));
    if (users.length) {
      users[0].password = hash;
      users[0].updatedAt = new Date().toISOString();
      fs.writeFileSync(USERS_JSON, JSON.stringify(users, null, 2));
    }
  }
}

async function updateTeacherPassword(hash) {
  try {
    const { readDB, writeDB } = require('./db/index');
    const all = readDB('teacher-accounts');
    if (all.length) {
      all[0].password = hash;
      all[0].updatedAt = new Date().toISOString();
      writeDB('teacher-accounts', all);
      return;
    }
  } catch (_) {}

  if (fs.existsSync(TEACH_JSON)) {
    const teachers = JSON.parse(fs.readFileSync(TEACH_JSON, 'utf8'));
    if (teachers.length) {
      teachers[0].password = hash;
      teachers[0].updatedAt = new Date().toISOString();
      fs.writeFileSync(TEACH_JSON, JSON.stringify(teachers, null, 2));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔐  St. Helens Security Setup\n' + '─'.repeat(44));

  const adminPwd   = genPassword(16);
  const teacherPwd = genPassword(16);
  const jwtSecret  = genJWT();

  console.log('⏳ Hashing passwords (this takes a moment)...');
  const adminHash   = await bcrypt.hash(adminPwd,   12);
  const teacherHash = await bcrypt.hash(teacherPwd, 12);

  // Update JWT secret in .env
  updateEnv(jwtSecret);
  console.log('✅ JWT secret updated in .env');

  // Update passwords
  await updateAdminPassword(adminHash);
  console.log('✅ Admin password updated');

  await updateTeacherPassword(teacherHash);
  console.log('✅ Teacher password updated');

  console.log('\n' + '═'.repeat(44));
  console.log('  SAVE THESE CREDENTIALS SECURELY');
  console.log('═'.repeat(44));
  console.log(`  Admin username   : admin`);
  console.log(`  Admin password   : ${adminPwd}`);
  console.log(`  Teacher username : admin  (teacher login)`);
  console.log(`  Teacher password : ${teacherPwd}`);
  console.log('═'.repeat(44));
  console.log('\n⚠️  These will NOT be shown again.');
  console.log('   Write them down or save in a password manager.\n');
}

main().catch(e => { console.error('Setup failed:', e.message); process.exit(1); });
