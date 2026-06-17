const router     = require('express').Router();
const { db }     = require('../db');

// GET /api/parent/student/:rollNo
router.get('/student/:rollNo', (req, res) => {
  try {
    const row = db.prepare("SELECT json_data FROM students WHERE rollNo=? AND (status='Active' OR status IS NULL)").get(req.params.rollNo);
    if (!row) return res.status(404).json({ success: false, message: 'Student not found.' });
    const s = JSON.parse(row.json_data);
    res.json({ success: true, data: { _id: s._id, rollNo: s.rollNo, name: s.name, fatherName: s.fatherName, class: s.class, section: s.section, gender: s.gender, photo: s.photo } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/fees/:rollNo
router.get('/fees/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    const sr = db.prepare('SELECT _id FROM students WHERE rollNo=?').get(req.params.rollNo);
    if (!sr) return res.status(404).json({ success: false, message: 'Student not found.' });
    let sql = 'SELECT json_data FROM fees WHERE student_id=?';
    const p = [sr._id];
    if (month) { sql += ' AND month=?'; p.push(month); }
    sql += ' ORDER BY createdAt DESC';
    const fees = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
    res.json({ success: true, data: fees });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/attendance/:rollNo
router.get('/attendance/:rollNo', (req, res) => {
  try {
    const { month } = req.query;
    let sql = 'SELECT json_data FROM attendance WHERE rollNo=?';
    const p = [req.params.rollNo];
    if (month) { sql += ' AND date LIKE ?'; p.push(month + '%'); }
    sql += ' ORDER BY date ASC';
    const data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data));
    res.json({ success: true, data, summary: { present: data.filter(a=>a.status==='Present').length, absent: data.filter(a=>a.status==='Absent').length, late: data.filter(a=>a.status==='Late').length, total: data.length } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/results/:rollNo
router.get('/results/:rollNo', (req, res) => {
  try {
    const { exam, year } = req.query;
    let sql = 'SELECT json_data FROM results WHERE rollNo=? COLLATE NOCASE';
    const p = [req.params.rollNo];
    if (exam) { sql += ' AND exam=?'; p.push(exam); }
    if (year) { sql += ' AND year=?'; p.push(year); }
    sql += ' ORDER BY createdAt DESC';
    res.json({ success: true, data: db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data)) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/homework
router.get('/homework', (req, res) => {
  try {
    const { class: cls, section } = req.query;
    let sql = 'SELECT json_data FROM homework WHERE 1=1';
    const p = [];
    if (cls)     { sql += ' AND class=?';   p.push(cls); }
    if (section) { sql += ' AND section=?'; p.push(section); }
    sql += ' ORDER BY createdAt DESC LIMIT 20';
    res.json({ success: true, data: db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data)) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/parent/notices
router.get('/notices', (req, res) => {
  try {
    const data = db.prepare('SELECT json_data FROM news ORDER BY createdAt DESC LIMIT 10').all().map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
