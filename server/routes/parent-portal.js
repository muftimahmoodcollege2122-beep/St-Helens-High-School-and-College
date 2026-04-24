// ── Parent Portal (public, lookup by roll number) ────────────────────────────
const router     = require('express').Router();
const { readDB } = require('../db');

// GET /api/parent/student/:rollNo
router.get('/student/:rollNo', (req, res) => {
  try {
    const student = readDB('students').find(
      s => s.rollNo === req.params.rollNo && (s.status === 'Active' || !s.status)
    );
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    const { _id, rollNo, name, fatherName, class: cls, section, gender, photo } = student;
    res.json({ success: true, data: { _id, rollNo, name, fatherName, class: cls, section, gender, photo } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/fees/:rollNo
router.get('/fees/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    const student   = readDB('students').find(s => s.rollNo === req.params.rollNo);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    let fees = readDB('fees').filter(f => f.student === student._id);
    if (month) fees = fees.filter(f => f.month === month);
    fees.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: fees });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/attendance/:rollNo
router.get('/attendance/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    let data = readDB('attendance').filter(a => a.rollNo === req.params.rollNo);
    if (month) data = data.filter(a => a.date && a.date.startsWith(month));
    data.sort((a, b) => new Date(a.date) - new Date(b.date));
    const present = data.filter(a => a.status === 'Present').length;
    const absent  = data.filter(a => a.status === 'Absent').length;
    const late    = data.filter(a => a.status === 'Late').length;
    res.json({ success: true, data, summary: { present, absent, late, total: data.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/results/:rollNo
router.get('/results/:rollNo', (req, res) => {
  try {
    const { exam, year } = req.query;
    let data = readDB('results').filter(r => r.rollNo === req.params.rollNo);
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/homework?class=&section=
router.get('/homework', (req, res) => {
  try {
    const { class: cls, section } = req.query;
    let data = readDB('homework').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (cls)     data = data.filter(h => h.class   === cls);
    if (section) data = data.filter(h => h.section === section);
    res.json({ success: true, data: data.slice(0, 20) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/notices
router.get('/notices', (req, res) => {
  try {
    const news = readDB('news')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
    res.json({ success: true, data: news });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
