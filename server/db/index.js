// ── St. Helens SQLite Database Layer ────────────────────────────────────────
// Same exported API as the old JSON layer (readDB, writeDB, newId,
// readSettings, writeSettings, attOps, DB_FILE) so route files do NOT
// need to change. Backed by SQLite (better-sqlite3) instead of JSON files,
// so it scales to large record counts and writes are atomic/transactional.

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DB_DIR  = path.join(__dirname, 'schools', 'shhs');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_FILE = path.join(DB_DIR, 'shhs.sqlite3');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');     // safe concurrent reads while writing
db.pragma('foreign_keys = ON');

// ── Generic key-value-per-collection store ──────────────────────────────────
// One table holds every collection. Each record is a JSON blob keyed by _id,
// indexed by (collection, id) for fast single-row lookups/deletes — unlike
// the old layer, single deletes/updates no longer require rewriting the
// entire collection.
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT,
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);

  CREATE TABLE IF NOT EXISTS settings_kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );

  -- attendance gets a real indexed table: years of daily records across every
  -- student is the one collection guaranteed to reach millions of rows, and
  -- JSON-blob scanning does not hold up at that volume.
  CREATE TABLE IF NOT EXISTS attendance (
    id      TEXT PRIMARY KEY,
    date    TEXT NOT NULL,
    class   TEXT,
    section TEXT,
    rollNo  TEXT,
    status  TEXT,
    extra   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_att_date           ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_att_class_section   ON attendance(class, section, date);
  CREATE INDEX IF NOT EXISTS idx_att_rollno          ON attendance(rollNo, date);
`);

const stmts = {
  selectAll:   db.prepare('SELECT id, data FROM records WHERE collection = ?'),
  selectOne:   db.prepare('SELECT data FROM records WHERE collection = ? AND id = ?'),
  upsert:      db.prepare(`INSERT INTO records (collection, id, data, created_at)
                            VALUES (@collection, @id, @data, @created_at)
                            ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data`),
  deleteOne:   db.prepare('DELETE FROM records WHERE collection = ? AND id = ?'),
  deleteAll:   db.prepare('DELETE FROM records WHERE collection = ?'),
  settingsGet: db.prepare('SELECT v FROM settings_kv WHERE k = ?'),
  settingsSet: db.prepare(`INSERT INTO settings_kv (k, v) VALUES (?, ?)
                            ON CONFLICT(k) DO UPDATE SET v = excluded.v`),
};

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function recordId(rec) {
  // Most records use _id; attendance/some collections may use id. Support both.
  return rec._id || rec.id || newId();
}

function readDB(collection) {
  const rows = stmts.selectAll.all(collection);
  return rows.map(r => JSON.parse(r.data));
}

// Kept for full backward compatibility with existing route code, which does
// read-modify-writeDB(wholeArray). Internally this is now a single fast
// transaction instead of a full-file rewrite, and is safe for concurrent
// access (WAL mode + transaction), so it no longer corrupts on overlapping
// writes the way the JSON file version could.
const writeDBTxn = db.transaction((collection, data) => {
  stmts.deleteAll.run(collection);
  const insert = db.prepare(`INSERT INTO records (collection, id, data, created_at)
                              VALUES (@collection, @id, @data, @created_at)`);
  for (const rec of data) {
    insert.run({
      collection,
      id: recordId(rec),
      data: JSON.stringify(rec),
      created_at: rec.createdAt || null,
    });
  }
});

function writeDB(collection, data) {
  if (!Array.isArray(data)) throw new Error(`writeDB("${collection}"): must be array`);
  writeDBTxn(collection, data);
}

// ── Efficient single-record ops (preferred for new/updated route code) ──────
// Use these instead of readDB+writeDB when you only need to touch one record
// — e.g. gallery delete should call deleteRecord('gallery', id) rather than
// read the whole collection, filter, and rewrite it.
function getRecord(collection, id) {
  const row = stmts.selectOne.get(collection, id);
  return row ? JSON.parse(row.data) : null;
}

function putRecord(collection, rec) {
  const id = recordId(rec);
  stmts.upsert.run({
    collection, id,
    data: JSON.stringify(rec),
    created_at: rec.createdAt || null,
  });
  return rec;
}

function deleteRecord(collection, id) {
  const result = stmts.deleteOne.run(collection, id);
  return result.changes > 0;
}

// ── Settings (single object, not an array) ──────────────────────────────────
function readSettings() {
  const row = stmts.settingsGet.get('settings');
  return row ? JSON.parse(row.v) : null;
}

function writeSettings(data) {
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('writeSettings: must be plain object');
  stmts.settingsSet.run('settings', JSON.stringify(data));
}

// ── attendance: real indexed SQL table (millions of rows over years) ────────
// Attendance is the one collection guaranteed to reach millions of rows
// (years × students × school days), so it gets real columns + indexes
// instead of JSON-blob scanning like the generic `records` table.
const attStmts = {
  insert: db.prepare(`INSERT INTO attendance (id, date, class, section, rollNo, status, extra)
                       VALUES (@id, @date, @class, @section, @rollNo, @status, @extra)
                       ON CONFLICT(id) DO UPDATE SET date=excluded.date, class=excluded.class,
                         section=excluded.section, rollNo=excluded.rollNo, status=excluded.status, extra=excluded.extra`),
  deleteByDateClassSection: db.prepare('DELETE FROM attendance WHERE date=? AND class=? AND section=?'),
  byRollMonth:  db.prepare(`SELECT * FROM attendance WHERE rollNo=? AND date LIKE ? ORDER BY date`),
  byRoll:       db.prepare(`SELECT * FROM attendance WHERE rollNo=? ORDER BY date`),
  deleteYear:   db.prepare(`DELETE FROM attendance WHERE date LIKE ?`),
  distinctYears: db.prepare(`SELECT DISTINCT substr(date,1,4) AS y FROM attendance ORDER BY y DESC`),
  countByYear:  db.prepare(`SELECT substr(date,1,4) AS year, COUNT(*) AS total FROM attendance GROUP BY year ORDER BY year DESC`),
  deleteOne:    db.prepare('DELETE FROM attendance WHERE id=?'),
  getOne:       db.prepare('SELECT * FROM attendance WHERE id=?'),
};

function rowToAttendanceRecord(row) {
  if (!row) return null;
  const extra = row.extra ? JSON.parse(row.extra) : {};
  return { _id: row.id, date: row.date, class: row.class, section: row.section,
           rollNo: row.rollNo, status: row.status, ...extra };
}

function attendanceRecordToRow(rec) {
  const { _id, date, class: cls, section, rollNo, status, ...rest } = rec;
  return { id: _id || newId(), date, class: cls, section, rollNo, status,
           extra: Object.keys(rest).length ? JSON.stringify(rest) : null };
}

const insertAttendanceTxn = db.transaction((rows) => {
  for (const r of rows) attStmts.insert.run(attendanceRecordToRow(r));
});

const attOps = {
  // Bulk-replace one class/section/date's worth of attendance — bounded by
  // class size (tens of rows), not the whole table, so this stays fast
  // forever no matter how many years of records pile up.
  replaceBulk(date, cls, section, records) {
    const txn = db.transaction(() => {
      attStmts.deleteByDateClassSection.run(date, cls, section);
      insertAttendanceTxn(records.map(r => ({ ...r, date, class: cls, section })));
    });
    txn();
  },
  query({ date, cls, section } = {}) {
    let sql = 'SELECT * FROM attendance WHERE 1=1';
    const params = [];
    if (date)    { sql += ' AND date=?';    params.push(date); }
    if (cls)     { sql += ' AND class=?';   params.push(cls); }
    if (section) { sql += ' AND section=?'; params.push(section); }
    sql += ' ORDER BY date';
    return db.prepare(sql).all(...params).map(rowToAttendanceRecord);
  },
  summary(date) {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN status='Absent'  THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN status='Late'    THEN 1 ELSE 0 END) AS late
      FROM attendance WHERE date=?`).get(date);
    return { date, total: row.total, present: row.present||0, absent: row.absent||0, late: row.late||0 };
  },
  studentHistory(rollNo, month) {
    const rows = month
      ? attStmts.byRollMonth.all(rollNo, `${month}%`)
      : attStmts.byRoll.all(rollNo);
    return rows.map(rowToAttendanceRecord);
  },
  deleteYear(year) {
    return attStmts.deleteYear.run(`${year}%`).changes;
  },
  years() {
    return attStmts.distinctYears.all().map(r => r.y);
  },
  countByYear() {
    return attStmts.countByYear.all();
  },
  updateRecord(_id, fields) {
    const row = attStmts.getOne.get(_id);
    if (!row) return null;
    const existing = rowToAttendanceRecord(row);
    const updated = { ...existing, ...fields, _id };
    attStmts.insert.run(attendanceRecordToRow(updated));
    return updated;
  },
  deleteOne(_id) {
    return attStmts.deleteOne.run(_id).changes > 0;
  }
};

// ── One-time migration: import legacy JSON files into SQLite ────────────────
// Runs only if the records table is still empty AND legacy .json files exist.
// Safe to leave in place permanently — it's a no-op once migrated.
(function migrateLegacyJsonIfNeeded() {
  const alreadyHasData = db.prepare('SELECT COUNT(*) AS c FROM records').get().c > 0
    || db.prepare('SELECT COUNT(*) AS c FROM attendance').get().c > 0;
  if (alreadyHasData) return;

  const jsonFiles = fs.readdirSync(DB_DIR).filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) return;

  console.log('🔄  Migrating legacy JSON data into SQLite...');
  for (const file of jsonFiles) {
    const collection = file.replace(/\.json$/, '');
    const raw = fs.readFileSync(path.join(DB_DIR, file), 'utf8').trim();
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }

    if (collection === 'settings' && !Array.isArray(parsed)) {
      writeSettings(parsed);
      console.log(`   ✓ settings (object)`);
      continue;
    }
    if (collection === 'attendance' && Array.isArray(parsed) && parsed.length) {
      insertAttendanceTxn(parsed);
      console.log(`   ✓ attendance (${parsed.length} records, indexed table)`);
      continue;
    }
    if (Array.isArray(parsed) && parsed.length) {
      writeDB(collection, parsed);
      console.log(`   ✓ ${collection} (${parsed.length} records)`);
    }
  }
  console.log('✅  Migration complete. Legacy .json files left untouched as backup.');
})();

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

module.exports = {
  readDB, writeDB, newId, readSettings, writeSettings, attOps, DB_FILE,
  getRecord, putRecord, deleteRecord,
};
