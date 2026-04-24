const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

// ── PUBLIC: lookup result by roll number (no auth needed) ─────────────────────
router.get('/lookup', (req, res) => {
  const { rollNo, exam, year } = req.query;
  if (!rollNo) return res.status(400).json({ success: false, message: 'Roll number is required.' });

  let data = readDB('results');
  let matches = data.filter(r => r.rollNo.toLowerCase() === rollNo.toLowerCase().trim());

  if (exam)  matches = matches.filter(r => r.exam === exam);
  if (year)  matches = matches.filter(r => r.year === year);

  if (matches.length === 0) {
    return res.status(404).json({ success: false, message: 'No result found for this roll number.' });
  }

  // Return result(s) but never expose internal _id details we don't need
  const safe = matches.map(r => ({
    rollNo: r.rollNo,
    studentName: r.studentName,
    class: r.class,
    section: r.section,
    exam: r.exam,
    year: r.year,
    subjects: r.subjects,
    remarks: r.remarks,
    createdAt: r.createdAt
  }));

  res.json({ success: true, data: safe });
});

// ── ADMIN: get all results (protected) ────────────────────────────────────────
router.get('/', protect, (req, res) => {
  const { search, exam, year } = req.query;
  let data = readDB('results').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (exam)   data = data.filter(r => r.exam === exam);
  if (year)   data = data.filter(r => r.year === year);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(r =>
      (r.rollNo || '').toLowerCase().includes(q) ||
      (r.studentName || '').toLowerCase().includes(q)
    );
  }
  res.json({ success: true, data, total: data.length });
});

// ── ADMIN: add result (protected) ─────────────────────────────────────────────
router.post('/', protect, (req, res) => {
  const { rollNo, studentName, class: cls, section, exam, year, subjects, remarks } = req.body;

  if (!rollNo || !studentName || !cls || !exam || !year) {
    return res.status(400).json({ success: false, message: 'rollNo, studentName, class, exam and year are required.' });
  }
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one subject is required.' });
  }

  const all = readDB('results');

  // Prevent duplicate result for same rollNo + exam + year
  const exists = all.find(r => r.rollNo.toLowerCase() === rollNo.toLowerCase() && r.exam === exam && r.year === year);
  if (exists) {
    return res.status(409).json({ success: false, message: `Result for Roll No "${rollNo}" in "${exam} ${year}" already exists. Delete and re-add to update.` });
  }

  const item = {
    _id: newId(),
    rollNo: rollNo.trim(),
    studentName: studentName.trim(),
    class: cls.trim(),
    section: (section || 'A').trim(),
    exam: exam.trim(),
    year: year.trim(),
    subjects,
    remarks: remarks || '',
    createdAt: new Date().toISOString()
  };

  all.push(item);
  writeDB('results', all);
  res.status(201).json({ success: true, message: 'Result added.', data: item });
});

// ── ADMIN: bulk import results — direct SQL upsert, chunked-safe ─────────────
router.post('/bulk', protect, (req, res) => {
  const { rows, exam, year, overwrite } = req.body;

  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ success: false, message: 'No rows provided.' });
  if (!exam || !year)
    return res.status(400).json({ success: false, message: 'exam and year are required.' });

  try {
    const { db } = require('../db');
    const added = [], skipped = [], errors = [];

    const tx = db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo      = (row.rollNo || row.roll_no || row['Roll No'] || '').toString().trim();
          const studentName = (row.studentName || row.student_name || row['Student Name'] || row.name || '').toString().trim();
          const cls         = (row.class || row.Class || row['Class'] || '').toString().trim();
          const section     = (row.section || row.Section || 'A').toString().trim();
          const remarks     = (row.remarks || row.Remarks || '').toString().trim();

          if (!rollNo || !studentName || !cls) {
            errors.push(`Row ${idx+2}: Missing rollNo, studentName or class.`); return;
          }

          // Build subjects from columns
          const subjects = [];
          const metaKeys = new Set(['rollNo','roll_no','Roll No','studentName','student_name','Student Name','name','class','Class','section','Section','remarks','Remarks','exam','year']);
          const keys = Object.keys(row);

          const subjectNames = new Set();
          keys.forEach(k => {
            if (metaKeys.has(k)) return;
            const lower = k.toLowerCase();
            if (lower.endsWith('_total') || lower.endsWith('_obtained') || lower.endsWith(' total') || lower.endsWith(' obtained')) {
              const sub = k.replace(/_total$/i,'').replace(/_obtained$/i,'').replace(/ total$/i,'').replace(/ obtained$/i,'').trim();
              subjectNames.add(sub);
            }
          });

          if (subjectNames.size > 0) {
            subjectNames.forEach(sub => {
              const totalKey = keys.find(k => k.toLowerCase() === (sub+'_total').toLowerCase() || k.toLowerCase() === (sub+' total').toLowerCase());
              const obtKey   = keys.find(k => k.toLowerCase() === (sub+'_obtained').toLowerCase() || k.toLowerCase() === (sub+' obtained').toLowerCase());
              const total    = totalKey ? Number(row[totalKey]) : 100;
              const obtained = obtKey   ? Number(row[obtKey])   : 0;
              if (sub) subjects.push({ name: sub, totalMarks: total, obtainedMarks: obtained });
            });
          } else {
            keys.forEach(k => {
              if (metaKeys.has(k)) return;
              const val = Number(row[k]);
              if (!isNaN(val) && val >= 0) subjects.push({ name: k, totalMarks: 100, obtainedMarks: val });
            });
          }

          if (!subjects.length) { errors.push(`Row ${idx+2}: No subjects found for roll no ${rollNo}.`); return; }

          const existing = db.prepare('SELECT _id FROM results WHERE rollNo=? AND exam=? AND year=? COLLATE NOCASE').get(rollNo, exam, year);
          if (existing) {
            if (overwrite) {
              const upd = { _id: existing._id, rollNo, studentName, class: cls, section, exam, year, subjects, remarks, createdAt: new Date().toISOString() };
              db.prepare('UPDATE results SET json_data=? WHERE _id=?').run(JSON.stringify(upd), existing._id);
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} updated.`);
            } else {
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} in "${exam} ${year}" already exists — skipped.`);
            }
            return;
          }

          const item = { _id: newId(), rollNo, studentName, class: cls, section, exam, year, subjects, remarks, createdAt: new Date().toISOString() };
          db.prepare('INSERT INTO results(_id,rollNo,exam,year,class,json_data,createdAt) VALUES (?,?,?,?,?,?,?)')
            .run(item._id, rollNo, exam, year, cls, JSON.stringify(item), item.createdAt);
          added.push(rollNo);
        } catch (e) { errors.push(`Row ${idx+2}: ${e.message}`); }
      });
    });
    tx();

    res.json({
      success: true,
      message: `Import complete. Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`,
      added: added.length, skipped: skipped.length, errors
    });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
// ── ADMIN: bulk delete results (protected) ────────────────────────────────────
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, exam, year, deleteAll } = req.body;
    let all = readDB('results');
    const before = all.length;
    if (deleteAll) {
      all = [];
    } else if (Array.isArray(ids) && ids.length) {
      const idSet = new Set(ids);
      all = all.filter(r => !idSet.has(r._id));
    } else if (exam || year) {
      all = all.filter(r => {
        if (exam && year) return !(r.exam === exam && r.year === year);
        if (exam) return r.exam !== exam;
        return r.year !== year;
      });
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, exam/year, or deleteAll:true' });
    }
    writeDB('results', all);
    res.json({ success: true, message: `Deleted ${before - all.length} result(s).`, deleted: before - all.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── ADMIN: delete result (protected) ──────────────────────────────────────────
router.delete('/:id', protect, (req, res) => {
  let all = readDB('results');
  const idx = all.findIndex(r => r._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all.splice(idx, 1);
  writeDB('results', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;

// ── CSV Export ────────────────────────────────────────────────────────────────
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = readDB('results');
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','name','class','exam','year','total','obtained','grade','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=results.csv');
    res.send(header + '\n' + csv.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});
