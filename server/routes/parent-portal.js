const router = require('express').Router();
const { readDB, attOps } = require('../db');

router.get('/student/:rollNo', (req, res) => {
  try {
    const s = readDB('students').find(s => s.rollNo === req.params.rollNo && (s.status === 'Active' || !s.status));
    if (!s) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.json({ success: true, data: { _id: s._id, rollNo: s.rollNo, name: s.name, fatherName: s.fatherName, class: s.class, section: s.section, gender: s.gender, photo: s.photo } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/fees/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    const sr = readDB('students').find(s => s.rollNo === req.params.rollNo);
    if (!sr) return res.status(404).json({ success: false, message: 'Student not found.' });
    let fees = readDB('fees').filter(f => f.student_id === sr._id || f.student === sr._id);
    if (month) fees = fees.filter(f => f.month === month);
    fees.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: fees });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/attendance/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    const data = attOps.studentHistory(req.params.rollNo, month);
    res.json({ success: true, data, summary: { present: data.filter(a=>a.status==='Present').length, absent: data.filter(a=>a.status==='Absent').length, late: data.filter(a=>a.status==='Late').length, total: data.length } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/results/:rollNo', (req, res) => {
  try {
    const { exam, year } = req.query;
    let data = readDB('results').filter(r => (r.rollNo||'').toLowerCase() === req.params.rollNo.toLowerCase());
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/homework', (req, res) => {
  try {
    const { class: cls, section } = req.query;
    let data = readDB('homework');
    if (cls)     data = data.filter(h => h.class === cls);
    if (section) data = data.filter(h => h.section === section);
    data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: data.slice(0, 20) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/notices', (req, res) => {
  try {
    const data = readDB('news').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
