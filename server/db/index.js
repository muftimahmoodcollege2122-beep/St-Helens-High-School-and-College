// ── St. Helen's SQLite Database Layer ───────────────────────────────────────
// Single-file SQLite DB. Indexed for fast queries at scale (millions of rows).
// Drop-in API-compatible with the old JSON layer: readDB / writeDB / readSettings /
// writeSettings / attOps / newId — so no route files need to change.
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, 'schools', 'shhs');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_FILE = path.join(DB_DIR, 'shhs.db');
const db      = new Database(DB_FILE);

// ── Performance pragmas ────────────────────────────────────────────────────
db.pragma('journal_mode = WAL');
db.pragma('synchronous  = NORMAL');
db.pragma('cache_size   = -32000');   // ~32MB page cache
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────
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
  CREATE INDEX IF NOT EXISTS idx_att_date        ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_att_class       ON attendance(class);
  CREATE INDEX IF NOT EXISTS idx_att_rollNo      ON attendance(rollNo);
  CREATE INDEX IF NOT EXISTS idx_att_class_sec   ON attendance(class, section, date);
  CREATE INDEX IF NOT EXISTS idx_att_roll_date   ON attendance(rollNo, date);

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
  CREATE INDEX IF NOT EXISTS idx_results_class  ON results(class);

  CREATE TABLE IF NOT EXISTS admissions (
    _id           TEXT PRIMARY KEY,
    studentName   TEXT,
    applyingClass TEXT,
    status        TEXT DEFAULT 'Pending',
    json_data     TEXT NOT NULL,
    createdAt     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
  CREATE INDEX IF NOT EXISTS idx_admissions_class  ON admissions(applyingClass);

  CREATE TABLE IF NOT EXISTS users (
    _id        TEXT PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    role       TEXT DEFAULT 'admin',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

  CREATE TABLE IF NOT EXISTS teacher_accounts (
    _id        TEXT PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ta_username ON teacher_accounts(username);

  CREATE TABLE IF NOT EXISTS teachers (
    _id        TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    status     TEXT DEFAULT 'Active',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS news (
    _id        TEXT PRIMARY KEY,
    category   TEXT DEFAULT 'General',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);

  CREATE TABLE IF NOT EXISTS events (
    _id        TEXT PRIMARY KEY,
    date       TEXT,
    status     TEXT DEFAULT 'upcoming',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

  CREATE TABLE IF NOT EXISTS gallery (
    _id        TEXT PRIMARY KEY,
    category   TEXT DEFAULT 'Other',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_gallery_category ON gallery(category);

  CREATE TABLE IF NOT EXISTS toppers (
    _id        TEXT PRIMARY KEY,
    rank       INTEGER DEFAULT 99,
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS contact (
    _id        TEXT PRIMARY KEY,
    status     TEXT DEFAULT 'unread',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_contact_status ON contact(status);

  CREATE TABLE IF NOT EXISTS alumni (
    _id        TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    batch      TEXT,
    status     TEXT DEFAULT 'Pending',
    public     TEXT DEFAULT 'Yes',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_alumni_status ON alumni(status);
  CREATE INDEX IF NOT EXISTS idx_alumni_batch  ON alumni(batch);

  CREATE TABLE IF NOT EXISTS homework (
    _id        TEXT PRIMARY KEY,
    class      TEXT,
    section    TEXT DEFAULT 'A',
    json_data  TEXT NOT NULL,
    createdAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_homework_class ON homework(class);

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

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function parseRows(rows) {
  return rows.map(r => { try { return JSON.parse(r.json_data); } catch { return null; } }).filter(Boolean);
}

// ── readDB ──────────────────────────────────────────────────────────────────
function readDB(collection) {
  const TABLE_MAP = {
    students:           'SELECT json_data FROM students ORDER BY createdAt ASC',
    attendance:         'SELECT json_data FROM attendance ORDER BY date ASC, createdAt ASC',
    fees:               'SELECT json_data FROM fees ORDER BY createdAt ASC',
    results:            'SELECT json_data FROM results ORDER BY createdAt ASC',
    admissions:         'SELECT json_data FROM admissions ORDER BY createdAt DESC',
    users:              'SELECT json_data FROM users ORDER BY createdAt ASC',
    'teacher-accounts': 'SELECT json_data FROM teacher_accounts ORDER BY createdAt ASC',
    teachers:           'SELECT json_data FROM teachers ORDER BY createdAt ASC',
    news:               'SELECT json_data FROM news ORDER BY createdAt DESC',
    events:             'SELECT json_data FROM events ORDER BY date ASC',
    gallery:            'SELECT json_data FROM gallery ORDER BY createdAt DESC',
    toppers:            'SELECT json_data FROM toppers ORDER BY rank ASC',
    contact:            'SELECT json_data FROM contact ORDER BY createdAt DESC',
    homework:           'SELECT json_data FROM homework ORDER BY createdAt DESC',
    alumni:             'SELECT json_data FROM alumni ORDER BY createdAt DESC',
  };
  const sql = TABLE_MAP[collection];
  if (sql) return parseRows(db.prepare(sql).all());
  return parseRows(db.prepare('SELECT json_data FROM documents WHERE collection=? ORDER BY createdAt ASC').all(collection));
}

// ── writeDB (full-collection replace, same contract as before) ───────────────
function writeDB(collection, dataArray) {
  if (!Array.isArray(dataArray)) throw new Error(`writeDB("${collection}"): data must be an array`);

  const tx = db.transaction((rows) => {
    if (collection === 'students') {
      db.prepare('DELETE FROM students').run();
      const ins = db.prepare('INSERT INTO students(_id,rollNo,name,class,section,status,json_data,createdAt) VALUES (@_id,@rollNo,@name,@class,@section,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), rollNo:r.rollNo||'', name:r.name||'', class:r.class||'', section:r.section||'A', status:r.status||'Active', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'attendance') {
      db.prepare('DELETE FROM attendance').run();
      const ins = db.prepare('INSERT INTO attendance(_id,rollNo,date,class,section,status,json_data,createdAt) VALUES (@_id,@rollNo,@date,@class,@section,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), rollNo:r.rollNo||'', date:r.date||'', class:r.class||'', section:r.section||'A', status:r.status||'Present', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'fees') {
      db.prepare('DELETE FROM fees').run();
      const ins = db.prepare('INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (@_id,@student_id,@month,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), student_id:r.student_id||r.student||'', month:r.month||'', status:r.status||'Unpaid', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'results') {
      db.prepare('DELETE FROM results').run();
      const ins = db.prepare('INSERT INTO results(_id,rollNo,exam,year,class,json_data,createdAt) VALUES (@_id,@rollNo,@exam,@year,@class,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), rollNo:r.rollNo||'', exam:r.exam||'', year:r.year||'', class:r.class||'', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'admissions') {
      db.prepare('DELETE FROM admissions').run();
      const ins = db.prepare('INSERT INTO admissions(_id,studentName,applyingClass,status,json_data,createdAt) VALUES (@_id,@studentName,@applyingClass,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), studentName:r.studentName||'', applyingClass:r.applyingClass||'', status:r.status||'Pending', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'users') {
      db.prepare('DELETE FROM users').run();
      const ins = db.prepare('INSERT INTO users(_id,username,role,json_data,createdAt) VALUES (@_id,@username,@role,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), username:r.username||'', role:r.role||'admin', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'teacher-accounts') {
      db.prepare('DELETE FROM teacher_accounts').run();
      const ins = db.prepare('INSERT INTO teacher_accounts(_id,username,json_data,createdAt) VALUES (@_id,@username,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), username:r.username||'', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'teachers') {
      db.prepare('DELETE FROM teachers').run();
      const ins = db.prepare('INSERT INTO teachers(_id,name,status,json_data,createdAt) VALUES (@_id,@name,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), name:r.name||'', status:r.status||'Active', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'news') {
      db.prepare('DELETE FROM news').run();
      const ins = db.prepare('INSERT INTO news(_id,category,json_data,createdAt) VALUES (@_id,@category,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), category:r.category||'General', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'events') {
      db.prepare('DELETE FROM events').run();
      const ins = db.prepare('INSERT INTO events(_id,date,status,json_data,createdAt) VALUES (@_id,@date,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), date:r.date||'', status:r.status||'upcoming', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'gallery') {
      db.prepare('DELETE FROM gallery').run();
      const ins = db.prepare('INSERT INTO gallery(_id,category,json_data,createdAt) VALUES (@_id,@category,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), category:r.category||'Other', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'toppers') {
      db.prepare('DELETE FROM toppers').run();
      const ins = db.prepare('INSERT INTO toppers(_id,rank,json_data,createdAt) VALUES (@_id,@rank,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), rank:r.rank||99, json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'contact') {
      db.prepare('DELETE FROM contact').run();
      const ins = db.prepare('INSERT INTO contact(_id,status,json_data,createdAt) VALUES (@_id,@status,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), status:r.status||'unread', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'homework') {
      db.prepare('DELETE FROM homework').run();
      const ins = db.prepare('INSERT INTO homework(_id,class,section,json_data,createdAt) VALUES (@_id,@class,@section,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), class:r.class||'', section:r.section||'A', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    if (collection === 'alumni') {
      db.prepare('DELETE FROM alumni').run();
      const ins = db.prepare('INSERT INTO alumni(_id,name,batch,status,public,json_data,createdAt) VALUES (@_id,@name,@batch,@status,@public,@json_data,@createdAt)');
      for (const r of rows) ins.run({ _id:r._id||newId(), name:r.name||'', batch:r.batch||'', status:r.status||'Pending', public:r.public||'Yes', json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
      return;
    }
    // Generic fallback
    db.prepare('DELETE FROM documents WHERE collection=?').run(collection);
    const ins = db.prepare('INSERT INTO documents(_id,collection,json_data,createdAt) VALUES (@_id,@collection,@json_data,@createdAt)');
    for (const r of rows) ins.run({ _id:r._id||newId(), collection, json_data:JSON.stringify(r), createdAt:r.createdAt||new Date().toISOString() });
  });
  tx(dataArray);
}

// ── Settings ────────────────────────────────────────────────────────────────
function readSettings() {
  const row = db.prepare('SELECT json_data FROM settings WHERE id = 1').get();
  if (!row) return null;
  try { return JSON.parse(row.json_data); } catch { return null; }
}

function writeSettings(data) {
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('writeSettings: must be plain object');
  db.prepare('INSERT OR REPLACE INTO settings(id, json_data) VALUES (1, ?)').run(JSON.stringify(data));
}

// ── Attendance fast-path operations (avoid full read/write for bulk saves) ───
// These are the critical ones for million-row scale: indexed, incremental,
// never load the whole table into memory.
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

// ── Seed admin user on first run ──────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const existing = db.prepare('SELECT _id FROM users WHERE username=?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  const adminId = newId();
  const adminUser = {
    _id: adminId, username: 'admin', password: hash,
    role: 'admin', name: 'Administrator',
    createdAt: new Date().toISOString()
  };
  db.prepare('INSERT INTO users(_id,username,role,json_data,createdAt) VALUES (?,?,?,?,?)')
    .run(adminId, 'admin', 'admin', JSON.stringify(adminUser), adminUser.createdAt);
  console.log('✅  Default admin created — username: admin / password: admin123');
  console.log('⚠️   Change the password immediately after first login!');
}

module.exports = { readDB, writeDB, newId, readSettings, writeSettings, attOps, db, DB_FILE };
