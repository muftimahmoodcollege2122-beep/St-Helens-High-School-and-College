const express     = require('express');
const router      = express.Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

// PUBLIC: lookup by roll number
router.get('/lookup', (req, res) => {
  const { rollNo, exam, year } = req.query;
  if (!rollNo) return res.status(400).json({ success: false, message: 'Roll number is required.' });
  let sql = 'SELECT json_data FROM results WHERE rollNo=? COLLATE NOCASE';
  const p = [rollNo.trim()];
  if (exam) { sql += ' AND exam=?'; p.push(exam); }
  if (year) { sql += ' AND year=?'; p.push(year); }
  const matches = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
  if (!matches.length) return res.status(404).json({ success: false, message: 'No result found for this roll number.' });
  const safe = matches.map(r => ({ rollNo: r.rollNo, studentName: r.studentName, class: r.class, section: r.section, exam: r.exam, year: r.year, subjects: r.subjects, remarks: r.remarks, createdAt: r.createdAt }));
  res.json({ success: true, data: safe });
});

// GET /api/results
router.get('/', protect, (req, res) => {
  const { search, exam, year } = req.query;
  let sql = 'SELECT json_data FROM results WHERE 1=1';
  const p = [];
  if (exam) { sql += ' AND exam=?'; p.push(exam); }
  if (year) { sql += ' AND year=?'; p.push(year); }
  sql += ' ORDER BY createdAt DESC';
  let data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(r => (r.rollNo||'').toLowerCase().includes(q) || (r.studentName||'').toLowerCase().includes(q));
  }
  res.json({ success: true, data, total: data.length });
});

// POST /api/results
router.post('/', protect, (req, res) => {
  const { rollNo, studentName, class: cls, section, exam, year, subjects, remarks } = req.body;
  if (!rollNo||!studentName||!cls||!exam||!year)
    return res.status(400).json({ success: false, message: 'rollNo, studentName, class, exam and year are required.' });
  if (!Array.isArray(subjects)||!subjects.length)
    return res.status(400).json({ success: false, message: 'At least one subject is required.' });
  const dup = db.prepare('SELECT _id FROM results WHERE rollNo=? AND exam=? AND year=? COLLATE NOCASE').get(rollNo.trim(), exam, year);
  if (dup) return res.status(409).json({ success: false, message: `Result for "${rollNo}" in "${exam} ${year}" already exists.` });
  const item = { _id: newId(), rollNo: rollNo.trim(), studentName: studentName.trim(), class: cls.trim(), section: (section||'A').trim(), exam: exam.trim(), year: year.trim(), subjects, remarks: remarks||'', createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO results(_id,rollNo,exam,year,class,json_data,createdAt) VALUES (?,?,?,?,?,?,?)').run(item._id, item.rollNo, item.exam, item.year, item.class, JSON.stringify(item), item.createdAt);
  res.status(201).json({ success: true, message: 'Result added.', data: item });
});

// POST /api/results/bulk
router.post('/bulk', protect, (req, res) => {
  const { rows, exam, year, overwrite } = req.body;
  if (!Array.isArray(rows)||!rows.length) return res.status(400).json({ success: false, message: 'No rows provided.' });
  if (!exam||!year) return res.status(400).json({ success: false, message: 'exam and year are required.' });
  try {
    const added = [], skipped = [], errors = [];
    db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo      = (row.rollNo||row['Roll No']||'').toString().trim();
          const studentName = (row.studentName||row['Student Name']||row.name||'').toString().trim();
          const cls         = (row.class||row.Class||'').toString().trim();
          const section     = (row.section||'A').toString().trim();
          const remarks     = (row.remarks||'').toString().trim();
          if (!rollNo||!studentName||!cls) { errors.push(`Row ${idx+2}: Missing fields.`); return; }
          const metaKeys = new Set(['rollNo','roll_no','Roll No','studentName','student_name','Student Name','name','class','Class','section','Section','remarks','Remarks','exam','year']);
          const subjects = [];
          const subjectNames = new Set();
          Object.keys(row).forEach(k => {
            if (metaKeys.has(k)) return;
            const l = k.toLowerCase();
            if (l.endsWith('_total')||l.endsWith(' total')||l.endsWith('_obtained')||l.endsWith(' obtained')) {
              subjectNames.add(k.replace(/_total$/i,'').replace(/_obtained$/i,'').replace(/ total$/i,'').replace(/ obtained$/i,'').trim());
            }
          });
          if (subjectNames.size) {
            subjectNames.forEach(sub => {
              const tKey = Object.keys(row).find(k=>k.toLowerCase()===(sub+'_total').toLowerCase()||(sub+' total').toLowerCase());
              const oKey = Object.keys(row).find(k=>k.toLowerCase()===(sub+'_obtained').toLowerCase()||(sub+' obtained').toLowerCase());
              subjects.push({ name: sub, totalMarks: tKey?Number(row[tKey]):100, obtainedMarks: oKey?Number(row[oKey]):0 });
            });
          } else {
            Object.keys(row).forEach(k => { if (metaKeys.has(k)) return; const v=Number(row[k]); if(!isNaN(v)&&v>=0) subjects.push({name:k,totalMarks:100,obtainedMarks:v}); });
          }
          if (!subjects.length) { errors.push(`Row ${idx+2}: No subjects.`); return; }
          const existing = db.prepare('SELECT _id FROM results WHERE rollNo=? AND exam=? AND year=? COLLATE NOCASE').get(rollNo, exam, year);
          if (existing) {
            if (overwrite) {
              const upd = { _id: existing._id, rollNo, studentName, class: cls, section, exam, year, subjects, remarks, createdAt: new Date().toISOString() };
              db.prepare('UPDATE results SET json_data=? WHERE _id=?').run(JSON.stringify(upd), existing._id);
              skipped.push(`Row ${idx+2}: updated.`);
            } else { skipped.push(`Row ${idx+2}: skipped.`); }
            return;
          }
          const item = { _id: newId(), rollNo, studentName, class: cls, section, exam, year, subjects, remarks, createdAt: new Date().toISOString() };
          db.prepare('INSERT INTO results(_id,rollNo,exam,year,class,json_data,createdAt) VALUES (?,?,?,?,?,?,?)').run(item._id,rollNo,exam,year,cls,JSON.stringify(item),item.createdAt);
          added.push(rollNo);
        } catch(e) { errors.push(`Row ${idx+2}: ${e.message}`); }
      });
    })();
    res.json({ success: true, message: `Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`, added: added.length, skipped: skipped.length, errors });
  } catch(e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/results/bulk/delete
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, exam, year, deleteAll } = req.body;
    let changes = 0;
    if (deleteAll) {
      changes = db.prepare('DELETE FROM results').run().changes;
    } else if (Array.isArray(ids)&&ids.length) {
      const del = db.prepare('DELETE FROM results WHERE _id=?');
      db.transaction(()=>{ ids.forEach(id=>{ changes+=del.run(id).changes; }); })();
    } else if (exam||year) {
      let sql = 'DELETE FROM results WHERE 1=1';
      const p = [];
      if (exam) { sql+=' AND exam=?'; p.push(exam); }
      if (year) { sql+=' AND year=?'; p.push(year); }
      changes = db.prepare(sql).run(...p).changes;
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, exam/year, or deleteAll:true' });
    }
    res.json({ success: true, message: `Deleted ${changes} result(s).`, deleted: changes });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/results/:id
router.delete('/:id', protect, (req, res) => {
  const changes = db.prepare('DELETE FROM results WHERE _id=?').run(req.params.id).changes;
  if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, message: 'Deleted.' });
});

// GET /api/results/export/csv
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = db.prepare('SELECT json_data FROM results ORDER BY createdAt ASC').all().map(r=>JSON.parse(r.json_data));
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','studentName','class','exam','year','remarks','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k=>`"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=results.csv');
    res.send(header+'\n'+csv.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
