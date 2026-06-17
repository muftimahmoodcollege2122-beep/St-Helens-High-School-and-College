// ── Students CRUD ─────────────────────────────────────────────────────────────
const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload      = require('../middleware/upload');

// ── helpers ───────────────────────────────────────────────────────────────────
function getOne(id) {
  const row = db.prepare('SELECT json_data FROM students WHERE _id=?').get(id);
  if (!row) return null;
  try { return JSON.parse(row.json_data); } catch { return null; }
}

function insertStudent(item) {
  db.prepare(`INSERT INTO students(_id,rollNo,name,class,section,status,json_data,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(item._id, item.rollNo, item.name, item.class, item.section||'A',
         item.status||'Active', JSON.stringify(item), item.createdAt);
}

function updateStudent(item) {
  db.prepare(`UPDATE students SET rollNo=?,name=?,class=?,section=?,status=?,json_data=? WHERE _id=?`)
    .run(item.rollNo, item.name, item.class, item.section||'A',
         item.status||'Active', JSON.stringify(item), item._id);
}

// GET /api/students
router.get('/', protect, (req, res) => {
  try {
    const { limit = 50, page = 1, class: cls, status, search } = req.query;
    let sql = 'SELECT json_data FROM students WHERE 1=1';
    const p = [];
    if (cls)    { sql += ' AND class=?';  p.push(cls); }
    if (status) { sql += ' AND status=?'; p.push(status); }
    sql += ' ORDER BY createdAt DESC';
    let data = db.prepare(sql).all(...p).map(r => { try { return JSON.parse(r.json_data); } catch { return null; } }).filter(Boolean);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(s =>
        (s.name||'').toLowerCase().includes(q) ||
        (s.rollNo||'').toLowerCase().includes(q) ||
        (s.fatherName||'').toLowerCase().includes(q)
      );
    }
    const total = data.length;
    const pg  = Math.max(1, parseInt(page));
    const lim = Math.min(10000, Math.max(1, parseInt(limit)));
    data = data.slice((pg - 1) * lim, pg * lim);
    res.json({ success: true, data, total, page: pg });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/:id
router.get('/:id', protect, (req, res) => {
  try {
    const item = getOne(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/students
router.post('/',
  protect,
  (req, res, next) => { req.uploadDir = 'students'; next(); },
  upload.single('photo'),
  (req, res) => {
    try {
      const { rollNo, name, class: cls, gender } = req.body;
      if (!rollNo || !name || !cls || !gender)
        return res.status(400).json({ success: false, message: 'rollNo, name, class, gender are required.' });

      const dup = db.prepare('SELECT _id FROM students WHERE rollNo=?').get(rollNo.trim());
      if (dup) return res.status(409).json({ success: false, message: `Roll number "${rollNo}" already exists.` });

      const item = {
        _id:        newId(),
        rollNo:     rollNo.trim(),
        name:       name.trim(),
        fatherName: (req.body.fatherName  || '').trim(),
        phone:      (req.body.phone       || '').trim(),
        fatherPhone:(req.body.fatherPhone || '').trim(),
        class:      cls.trim(),
        section:    (req.body.section     || 'A').trim(),
        gender:     gender.trim(),
        address:    (req.body.address     || '').trim(),
        status:     req.body.status || 'Active',
        photo:      req.file ? `/uploads/students/${req.file.filename}` : '',
        createdAt:  new Date().toISOString()
      };
      insertStudent(item);
      res.status(201).json({ success: true, message: 'Student added.', data: item });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// PUT /api/students/:id
router.put('/:id', protect, (req, res) => {
  try {
    const existing = getOne(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Student not found.' });
    const updated = { ...existing, ...req.body, _id: req.params.id };
    updateStudent(updated);
    res.json({ success: true, message: 'Updated.', data: updated });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/students/bulk/delete (MUST be before /:id)
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, class: cls, deleteAll } = req.body;
    let changes = 0;
    if (deleteAll) {
      changes = db.prepare('DELETE FROM students').run().changes;
    } else if (Array.isArray(ids) && ids.length) {
      const del = db.prepare('DELETE FROM students WHERE _id=?');
      db.transaction(() => { ids.forEach(id => { changes += del.run(id).changes; }); })();
    } else if (cls) {
      changes = db.prepare('DELETE FROM students WHERE class=?').run(cls).changes;
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, class, or deleteAll:true' });
    }
    res.json({ success: true, message: `Deleted ${changes} student(s).`, deleted: changes });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/students/bulk/import
router.post('/bulk/import', protect, (req, res) => {
  try {
    const { rows, overwrite } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No rows provided.' });

    const added = [], skipped = [], errors = [];
    db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo      = (row.rollNo || row.roll_no || row['Roll No'] || row['Roll Number'] || '').toString().trim();
          const name        = (row.name || row.Name || row['Student Name'] || row.studentName || '').toString().trim();
          const cls         = (row.class || row.Class || '').toString().trim();
          const gender      = (row.gender || row.Gender || 'Male').toString().trim();
          const fatherName  = (row.fatherName || row['Father Name'] || '').toString().trim();
          const phone       = (row.phone || row.Phone || '').toString().trim();
          const fatherPhone = (row.fatherPhone || row['Father Phone'] || '').toString().trim();
          const section     = (row.section || row.Section || 'A').toString().trim();
          const address     = (row.address || row.Address || '').toString().trim();
          const status      = (row.status || row.Status || 'Active').toString().trim();

          if (!rollNo || !name || !cls) { errors.push(`Row ${idx+2}: Missing rollNo, name or class.`); return; }

          const existing = db.prepare('SELECT _id FROM students WHERE rollNo=?').get(rollNo);
          if (existing) {
            if (overwrite) {
              const upd = { _id: existing._id, rollNo, name, fatherName, phone, fatherPhone, class: cls, section, gender, address, status, photo: '', createdAt: new Date().toISOString() };
              db.prepare('UPDATE students SET name=?,class=?,section=?,status=?,json_data=? WHERE _id=?')
                .run(name, cls, section, status, JSON.stringify(upd), existing._id);
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} updated.`);
            } else {
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} already exists — skipped.`);
            }
            return;
          }
          const item = { _id: newId(), rollNo, name, fatherName, phone, fatherPhone, class: cls, section, gender, address, status, photo: '', createdAt: new Date().toISOString() };
          db.prepare('INSERT INTO students(_id,rollNo,name,class,section,status,json_data,createdAt) VALUES (?,?,?,?,?,?,?,?)')
            .run(item._id, rollNo, name, cls, section, status, JSON.stringify(item), item.createdAt);
          added.push(rollNo);
        } catch (e) { errors.push(`Row ${idx+2}: ${e.message}`); }
      });
    })();
    res.json({ success: true, message: `Import complete. Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`, added: added.length, skipped: skipped.length, errors });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/students/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM students WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, message: 'Student deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/export/csv (MUST be before /:id — already is via order)
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = db.prepare('SELECT json_data FROM students ORDER BY createdAt ASC').all()
      .map(r => { try { return JSON.parse(r.json_data); } catch { return null; } }).filter(Boolean);
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','name','class','section','status','phone','fatherName','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=students.csv');
    res.send(header + '\n' + csv.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
