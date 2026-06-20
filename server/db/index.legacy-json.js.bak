// ── St. Helens JSON Database Layer ──────────────────────────────────────────
const path = require('path');
const fs   = require('fs');

const DB_DIR = path.join(__dirname, 'schools', 'shhs');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function dbFile(name) { return path.join(DB_DIR, `${name}.json`); }

function readDB(collection) {
  const f = dbFile(collection);
  if (!fs.existsSync(f)) return [];
  try {
    const raw = fs.readFileSync(f, 'utf8').trim();
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeDB(collection, data) {
  if (!Array.isArray(data)) throw new Error(`writeDB("${collection}"): must be array`);
  fs.writeFileSync(dbFile(collection), JSON.stringify(data, null, 2), 'utf8');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ── Settings ─────────────────────────────────────────────────────────────────
function readSettings() {
  const f = dbFile('settings');
  if (!fs.existsSync(f)) return null;
  try {
    const raw = fs.readFileSync(f, 'utf8').trim();
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSettings(data) {
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('writeSettings: must be plain object');
  fs.writeFileSync(dbFile('settings'), JSON.stringify(data, null, 2), 'utf8');
}

// ── attOps — attendance helpers ───────────────────────────────────────────────
const attOps = {
  replaceBulk(date, cls, section, records) {
    const all = readDB('attendance').filter(
      r => !(r.date === date && r.class === cls && r.section === section)
    );
    writeDB('attendance', [...all, ...records]);
  },
  query({ date, cls, section } = {}) {
    let data = readDB('attendance');
    if (date)    data = data.filter(r => r.date === date);
    if (cls)     data = data.filter(r => r.class === cls);
    if (section) data = data.filter(r => r.section === section);
    return data.sort((a, b) => (a.date > b.date ? 1 : -1));
  },
  summary(date) {
    const rows = readDB('attendance').filter(r => r.date === date);
    return {
      date, total: rows.length,
      present: rows.filter(r => r.status === 'Present').length,
      absent:  rows.filter(r => r.status === 'Absent').length,
      late:    rows.filter(r => r.status === 'Late').length,
    };
  },
  studentHistory(rollNo, month) {
    let data = readDB('attendance').filter(r => r.rollNo === rollNo);
    if (month) data = data.filter(r => r.date && r.date.startsWith(month));
    return data.sort((a, b) => (a.date > b.date ? 1 : -1));
  },
  deleteYear(year) {
    const all = readDB('attendance');
    const kept = all.filter(r => !String(r.date).startsWith(String(year)));
    writeDB('attendance', kept);
    return all.length - kept.length;
  },
  years() {
    const data = readDB('attendance');
    return [...new Set(data.map(r => String(r.date).slice(0, 4)))].sort().reverse();
  },
  countByYear() {
    const data = readDB('attendance');
    const map = {};
    data.forEach(r => {
      const y = String(r.date).slice(0, 4);
      map[y] = (map[y] || 0) + 1;
    });
    return Object.entries(map).map(([year, total]) => ({ year, total })).sort((a, b) => b.year - a.year);
  },
  updateRecord(_id, fields) {
    const data = readDB('attendance');
    const idx = data.findIndex(r => r._id === _id);
    if (idx === -1) return null;
    data[idx] = { ...data[idx], ...fields, _id };
    writeDB('attendance', data);
    return data[idx];
  },
  deleteOne(_id) {
    const data = readDB('attendance');
    const next = data.filter(r => r._id !== _id);
    writeDB('attendance', next);
    return next.length < data.length;
  }
};

// ── Seed admin user on first run ──────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const users = readDB('users');
if (!users.find(u => u.username === 'admin')) {
  const hash = bcrypt.hashSync('admin123', 10);
  const adminId = newId();
  users.push({
    _id: adminId, username: 'admin', password: hash,
    role: 'admin', name: 'Administrator',
    createdAt: new Date().toISOString()
  });
  writeDB('users', users);
  console.log('✅  Default admin created — username: admin / password: admin123');
  console.log('⚠️   Change the password immediately after first login!');
}

// ── DB_FILE kept for compatibility (points to shhs folder) ───────────────────
const DB_FILE = DB_DIR;

module.exports = { readDB, writeDB, newId, readSettings, writeSettings, attOps, DB_FILE };
