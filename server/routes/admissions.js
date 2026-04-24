const router = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

// POST /api/admissions — public submit
router.post('/', (req, res) => {
  try {
    const d = req.body;
    if (!d.studentName || !d.applyingClass) return res.status(400).json({ success: false, message: 'Student name and applying class are required.' });
    const admissions = readDB('admissions');
    const entry = { _id: newId(), ...d, status: 'Pending', createdAt: new Date().toISOString() };
    admissions.push(entry);
    writeDB('admissions', admissions);
    res.json({ success: true, message: 'Admission form submitted successfully.', id: entry._id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admissions — admin view all
router.get('/', protect, (req, res) => {
  try {
    res.json(readDB('admissions'));
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admissions/export/csv — MUST be before /:id
router.get('/export/csv', protect, (req, res) => {
  try {
    const admissions = readDB('admissions');
    if (!admissions.length) return res.send('studentName,applyingClass,status\nNo data yet');
    const keys = ['studentName','gender','dob','bForm','applyingClass','section','religion',
      'address','phone1','phone2','email',
      'fatherName','fatherCnic','fatherOccupation',
      'motherName','motherCnic',
      'prevSchool','prevClass','prevResult',
      'emergencyContact','emergencyPhone','medicalInfo',
      'transport','documents','status','createdAt'];
    const header = keys.join(',');
    const rows = admissions.map(a => keys.map(k => `"${(a[k]||'').toString().replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=admissions.csv');
    res.send(header + '\n' + rows.join('\n'));
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/admissions/:id/status
router.patch('/:id/status', protect, (req, res) => {
  try {
    const admissions = readDB('admissions');
    const idx = admissions.findIndex(a => a._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
    admissions[idx].status = req.body.status || admissions[idx].status;
    writeDB('admissions', admissions);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/admissions/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const admissions = readDB('admissions');
    writeDB('admissions', admissions.filter(a => a._id !== req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
