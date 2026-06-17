const router      = require('express').Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

// POST /api/admissions — public submit
router.post('/', (req, res) => {
  try {
    const d = req.body;
    if (!d.studentName || !d.applyingClass)
      return res.status(400).json({ success: false, message: 'Student name and applying class are required.' });
    const item = { _id: newId(), ...d, status: 'Pending', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO admissions(_id,status,json_data,createdAt) VALUES (?,?,?,?)')
      .run(item._id, 'Pending', JSON.stringify(item), item.createdAt);
    res.json({ success: true, message: 'Admission form submitted successfully.', id: item._id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admissions/export/csv — MUST be before /:id
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = db.prepare('SELECT json_data FROM admissions ORDER BY createdAt DESC').all().map(r => JSON.parse(r.json_data));
    if (!rows.length) return res.send('studentName,applyingClass,status\nNo data yet');
    const keys = ['studentName','gender','dob','bForm','applyingClass','section','stream','religion','nationality',
      'address','phone1','phone2','email','fatherName','fatherCnic','fatherOccupation','income',
      'motherName','motherCnic','motherOccupation','prevSchool','prevClass','prevResult','transferReason',
      'emergencyContact','emergencyPhone','medicalInfo','transport','pickupArea','documents','status','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(a => keys.map(k => `"${(a[k]||'').toString().replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=admissions.csv');
    res.send(header + '\n' + csv.join('\n'));
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admissions — admin view all
router.get('/', protect, (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT json_data FROM admissions WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    sql += ' ORDER BY createdAt DESC';
    const data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
    res.json({ success: true, data, total: data.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/admissions/:id/status
router.patch('/:id/status', protect, (req, res) => {
  try {
    const row = db.prepare('SELECT json_data FROM admissions WHERE _id=?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
    const item = JSON.parse(row.json_data);
    item.status = req.body.status || item.status;
    db.prepare('UPDATE admissions SET status=?,json_data=? WHERE _id=?').run(item.status, JSON.stringify(item), req.params.id);
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/admissions/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM admissions WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
