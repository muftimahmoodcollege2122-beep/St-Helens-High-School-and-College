// ── Students CRUD ─────────────────────────────────────────────────────────────
const express        = require('express');
const router         = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect }    = require('../middleware/auth');
const upload         = require('../middleware/upload');

// GET /api/students
router.get('/', protect, (req, res) => {
  try {
    const { limit = 50, page = 1, class: cls, status, search } = req.query;
    let data = readDB('students').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (cls)    data = data.filter(s => s.class  === cls);
    if (status) data = data.filter(s => s.status === status);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(s =>
        (s.name   || '').toLowerCase().includes(q) ||
        (s.rollNo || '').toLowerCase().includes(q) ||
        (s.fatherName || '').toLowerCase().includes(q)
      );
    }
    const total = data.length;
    const pg    = Math.max(1, parseInt(page));
    const lim   = Math.min(10000, Math.max(1, parseInt(limit)));
    data = data.slice((pg - 1) * lim, pg * lim);
    res.json({ success: true, data, total, page: pg });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/:id
router.get('/:id', protect, (req, res) => {
  try {
    const item = readDB('students').find(s => s._id === req.params.id);
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
      if (!rollNo || !name || !cls || !gender) {
        return res.status(400).json({ success: false, message: 'rollNo, name, class, gender are required.' });
      }
      const all = readDB('students');
      // Duplicate roll number check
      if (all.find(s => s.rollNo === rollNo.trim())) {
        return res.status(409).json({ success: false, message: `Roll number "${rollNo}" already exists.` });
      }
      const item = {
        _id:        newId(),
        rollNo:     rollNo.trim(),
        name:       name.trim(),
        fatherName: (req.body.fatherName || '').trim(),
        phone:      (req.body.phone      || '').trim(),
        fatherPhone:(req.body.fatherPhone|| '').trim(),
        class:      cls.trim(),
        section:    (req.body.section    || 'A').trim(),
        gender:     gender.trim(),
        address:    (req.body.address    || '').trim(),
        status:     req.body.status || 'Active',
        photo:      req.file ? `/uploads/students/${req.file.filename}` : '',
        createdAt:  new Date().toISOString()
      };
      all.push(item);
      writeDB('students', all);
      res.status(201).json({ success: true, message: 'Student added.', data: item });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

// PUT /api/students/:id
router.put('/:id', protect, (req, res) => {
  try {
    const all = readDB('students');
    const idx = all.findIndex(s => s._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Student not found.' });
    all[idx] = {
      ...all[idx],
      ...req.body,
      _id:    req.params.id,
      status: req.body.status || all[idx].status || 'Active'
    };
    writeDB('students', all);
    res.json({ success: true, message: 'Updated.', data: all[idx] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/students/bulk/delete  — delete all or filtered students (MUST be before /:id)
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, class: cls, deleteAll } = req.body;
    let all = readDB('students');
    const before = all.length;
    if (deleteAll) {
      all = [];
    } else if (Array.isArray(ids) && ids.length) {
      const idSet = new Set(ids);
      all = all.filter(s => !idSet.has(s._id));
    } else if (cls) {
      all = all.filter(s => s.class !== cls);
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, class, or deleteAll:true' });
    }
    writeDB('students', all);
    res.json({ success: true, message: `Deleted ${before - all.length} student(s).`, deleted: before - all.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/students/bulk/import  — direct SQL upsert, chunked-safe (no full table rewrite)
router.post('/bulk/import', protect, (req, res) => {
  try {
    const { rows, overwrite } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No rows provided.' });

    const { db } = require('../db');
    const added = [], skipped = [], errors = [];

    const tx = db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo      = (row.rollNo || row.roll_no || row['Roll No'] || row['Roll Number'] || '').toString().trim();
          const name        = (row.name || row.Name || row['Student Name'] || row.studentName || '').toString().trim();
          const cls         = (row.class || row.Class || '').toString().trim();
          const gender      = (row.gender || row.Gender || 'Male').toString().trim();
          const fatherName  = (row.fatherName || row['Father Name'] || row.father_name || '').toString().trim();
          const phone       = (row.phone || row.Phone || '').toString().trim();
          const fatherPhone = (row.fatherPhone || row['Father Phone'] || row.father_phone || '').toString().trim();
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
    });
    tx();

    res.json({ success: true, message: `Import complete. Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`, added: added.length, skipped: skipped.length, errors });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
// DELETE /api/students/:id
router.delete('/:id', protect, (req, res) => {
  try {
    let all = readDB('students');
    const idx = all.findIndex(s => s._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Student not found.' });
    all.splice(idx, 1);
    writeDB('students', all);
    res.json({ success: true, message: 'Student deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;

// ── CSV Export ────────────────────────────────────────────────────────────────
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = readDB('students');
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','name','class','section','status','phone','fatherName','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=students.csv');
    res.send(header + '\n' + csv.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});
