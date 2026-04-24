// ── MMPC SQLite Database Layer ────────────────────────────────────────────────
// Drop-in replacement for the old JSON db.
// Uses better-sqlite3 (synchronous) so all existing routes work unchanged.
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, 'schools', 'mmpc');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_FILE = path.join(DB_DIR, 'mmpc.db');
const db      = new Database(DB_FILE);

// ── Performance pragmas ───────────────────────────────────────────────────────
db.pragma('journal_mode = WAL');
db.pragma('synchronous  = NORMAL');
db.pragma('cache_size   = -32000');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    _id        TEXT PRIMARY KEY,
    rollNo     TEXT NOT NULL,
    name       TEXT NOT NULL,
    class      TEXT,
    section    TEXT DEFAULT 'A',
    status     TEXT DEFAULT 'Active',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_students_class   ON students(class);
  CREATE INDEX IF NOT EXISTS idx_students_rollNo  ON students(rollNo);
  CREATE INDEX IF NOT EXISTS idx_students_status  ON students(status);

  CREATE TABLE IF NOT EXISTS attendance (
    _id         TEXT PRIMARY KEY,
    rollNo      TEXT NOT NULL,
    date        TEXT NOT NULL,
    class       TEXT NOT NULL,
    section     TEXT DEFAULT 'A',
    status      TEXT NOT NULL,
    json_data   TEXT NOT NULL,
    createdAt   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_att_date    ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_att_class   ON attendance(class);
  CREATE INDEX IF NOT EXISTS idx_att_rollNo  ON attendance(rollNo);

  CREATE TABLE IF NOT EXISTS fees (
    _id        TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    month      TEXT NOT NULL,
    status     TEXT DEFAULT 'Unpaid',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
  CREATE INDEX IF NOT EXISTS idx_fees_month   ON fees(month);
  CREATE INDEX IF NOT EXISTS idx_fees_status  ON fees(status);

  CREATE TABLE IF NOT EXISTS results (
    _id         TEXT PRIMARY KEY,
    rollNo      TEXT NOT NULL,
    exam        TEXT,
    year        TEXT,
    class       TEXT,
    json_data   TEXT NOT NULL,
    createdAt   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_results_rollNo ON results(rollNo);
  CREATE INDEX IF NOT EXISTS idx_results_exam   ON results(exam);
  CREATE INDEX IF NOT EXISTS idx_results_year   ON results(year);

  CREATE TABLE IF NOT EXISTS admissions (
    _id        TEXT PRIMARY KEY,
    studentName TEXT,
    applyingClass TEXT,
    status     TEXT DEFAULT 'Pending',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
  CREATE INDEX IF NOT EXISTS idx_admissions_class  ON admissions(applyingClass);

  CREATE TABLE IF NOT EXISTS documents (
    _id        TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection);

  CREATE TABLE IF NOT EXISTS settings (
    id         INTEGER PRIMARY KEY CHECK(id = 1),
    json_data  TEXT NOT NULL
  );
`);

// ── ID generator ─────────────────────────────────────────────────────────────
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function parseRows(rows) {
  return rows.map(r => { try { return JSON.parse(r.json_data); } catch { return null; } }).filter(Boolean);
}

// ── readDB ────────────────────────────────────────────────────────────────────
function readDB(collection) {
  if (collection === 'students')   return parseRows(db.prepare('SELECT json_data FROM students ORDER BY createdAt ASC').all());
  if (collection === 'attendance') return parseRows(db.prepare('SELECT json_data FROM attendance ORDER BY date ASC, createdAt ASC').all());
  if (collection === 'fees')       return parseRows(db.prepare('SELECT json_data FROM fees ORDER BY createdAt ASC').all());
  if (collection === 'results')    return parseRows(db.prepare('SELECT json_data FROM results ORDER BY createdAt ASC').all());
  if (collection === 'admissions') return parseRows(db.prepare('SELECT json_data FROM admissions ORDER BY createdAt DESC').all());
  return parseRows(db.prepare('SELECT json_data FROM documents WHERE collection = ? ORDER BY createdAt ASC').all(collection));
}

// ── writeDB ───────────────────────────────────────────────────────────────────
function writeDB(collection, dataArray) {
  if (!Array.isArray(dataArray)) throw new Error(`writeDB("${collection}"): data must be an array`);

  const tx = db.transaction((rows) => {
    if (collection === 'students') {
      db.prepare('DELETE FROM students').run();
      const ins = db.prepare(`INSERT INTO students(_id,rollNo,name,class,section,status,json_data,createdAt) VALUES (@_id,@rollNo,@name,@class,@section,@status,@json_data,@createdAt)`);
      for (const r of rows) ins.run({ _id: r._id, rollNo: r.rollNo||'', name: r.name||'', class: r.class||'', section: r.section||'A', status: r.status||'Active', json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'attendance') {
      db.prepare('DELETE FROM attendance').run();
      const ins = db.prepare(`INSERT INTO attendance(_id,rollNo,date,class,section,status,json_data,createdAt) VALUES (@_id,@rollNo,@date,@class,@section,@status,@json_data,@createdAt)`);
      for (const r of rows) ins.run({ _id: r._id, rollNo: r.rollNo||'', date: r.date||'', class: r.class||'', section: r.section||'A', status: r.status||'Present', json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'fees') {
      db.prepare('DELETE FROM fees').run();
      const ins = db.prepare(`INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (@_id,@student_id,@month,@status,@json_data,@createdAt)`);
      for (const r of rows) ins.run({ _id: r._id, student_id: r.student||'', month: r.month||'', status: r.status||'Unpaid', json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'results') {
      db.prepare('DELETE FROM results').run();
      const ins = db.prepare(`INSERT INTO results(_id,rollNo,exam,year,class,json_data,createdAt) VALUES (@_id,@rollNo,@exam,@year,@class,@json_data,@createdAt)`);
      for (const r of rows) ins.run({ _id: r._id, rollNo: r.rollNo||'', exam: r.exam||'', year: r.year||'', class: r.class||'', json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'admissions') {
      db.prepare('DELETE FROM admissions').run();
      const ins = db.prepare('INSERT INTO admissions(_id,studentName,applyingClass,status,json_data,createdAt) VALUES (@_id,@studentName,@applyingClass,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id: r._id||newId(), studentName: r.studentName||'', applyingClass: r.applyingClass||'', status: r.status||'Pending', json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
      return;
    }
    db.prepare('DELETE FROM documents WHERE collection = ?').run(collection);
    const ins = db.prepare(`INSERT INTO documents(_id,collection,json_data,createdAt) VALUES (@_id,@collection,@json_data,@createdAt)`);
    for (const r of rows) ins.run({ _id: r._id||newId(), collection, json_data: JSON.stringify(r), createdAt: r.createdAt||new Date().toISOString() });
  });

  tx(dataArray);
}

// ── Settings ──────────────────────────────────────────────────────────────────
function readSettings() {
  const row = db.prepare('SELECT json_data FROM settings WHERE id = 1').get();
  if (!row) return null;
  try { return JSON.parse(row.json_data); } catch { return null; }
}

function writeSettings(data) {
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('writeSettings: must be plain object');
  db.prepare('INSERT OR REPLACE INTO settings(id, json_data) VALUES (1, ?)').run(JSON.stringify(data));
}

// ── Attendance fast-path operations (avoid full read/write for bulk saves) ─────
const attOps = {
  replaceBulk(date, cls, section, records) {
    db.transaction(() => {
      db.prepare('DELETE FROM attendance WHERE date=? AND class=? AND section=?').run(date, cls, section);
      const ins = db.prepare(`INSERT INTO attendance(_id,rollNo,date,class,section,status,json_data,createdAt) VALUES (@_id,@rollNo,@date,@class,@section,@status,@json_data,@createdAt)`);
      for (const r of records) ins.run({ _id: r._id, rollNo: r.rollNo, date: r.date, class: r.class, section: r.section, status: r.status, json_data: JSON.stringify(r), createdAt: r.createdAt });
    })();
  },

  query({ date, cls, section } = {}) {
    let sql = 'SELECT json_data FROM attendance WHERE 1=1';
    const p = [];
    if (date)    { sql += ' AND date=?';    p.push(date); }
    if (cls)     { sql += ' AND class=?';   p.push(cls); }
    if (section) { sql += ' AND section=?'; p.push(section); }
    sql += ' ORDER BY date ASC';
    return parseRows(db.prepare(sql).all(...p));
  },

  summary(date) {
    const rows = db.prepare('SELECT status FROM attendance WHERE date=?').all(date);
    return { date, total: rows.length, present: rows.filter(r=>r.status==='Present').length, absent: rows.filter(r=>r.status==='Absent').length, late: rows.filter(r=>r.status==='Late').length };
  },

  studentHistory(rollNo, month) {
    let sql = 'SELECT json_data FROM attendance WHERE rollNo=?';
    const p = [rollNo];
    if (month) { sql += ' AND date LIKE ?'; p.push(month+'%'); }
    return parseRows(db.prepare(sql+' ORDER BY date ASC').all(...p));
  },

  // ── YEARLY DELETE ─────────────────────────────────────────────────────────
  deleteYear(year) {
    return db.prepare("DELETE FROM attendance WHERE substr(date,1,4) = ?").run(String(year)).changes;
  },

  years() {
    return db.prepare("SELECT DISTINCT substr(date,1,4) AS year FROM attendance ORDER BY year DESC").all().map(r => r.year);
  },

  countByYear() {
    return db.prepare("SELECT substr(date,1,4) AS year, COUNT(*) AS total FROM attendance GROUP BY year ORDER BY year DESC").all();
  },

  updateRecord(_id, fields) {
    const row = db.prepare('SELECT json_data FROM attendance WHERE _id=?').get(_id);
    if (!row) return null;
    const merged = { ...JSON.parse(row.json_data), ...fields, _id };
    db.prepare('UPDATE attendance SET status=?, json_data=? WHERE _id=?').run(merged.status||'Present', JSON.stringify(merged), _id);
    return merged;
  },

  deleteOne(_id) {
    return db.prepare('DELETE FROM attendance WHERE _id=?').run(_id).changes > 0;
  }
};

module.exports = { readDB, writeDB, newId, readSettings, writeSettings, attOps, db, DB_FILE };
