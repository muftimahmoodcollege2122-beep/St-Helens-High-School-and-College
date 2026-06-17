const router             = require('express').Router();
const { db, newId, attOps } = require('../db');
const { teacherProtect } = require('../middleware/teacherAuth');

// GET /api/teacher-panel/students
router.get('/students', teacherProtect, (req, res) => {
  try {
    const { assignedClass, assignedSection } = req.teacher;
    if (!assignedClass) return res.json({ success: true, data: [], message: 'No class assigned.' });
    let sql = "SELECT json_data FROM students WHERE class=? AND (status='Active' OR status IS NULL)";
    const p = [assignedClass];
    if (assignedSection) { sql += ' AND section=?'; p.push(assignedSection); }
    const students = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data))
      .sort((a,b) => (a.rollNo||'').localeCompare(b.rollNo||'', undefined, { numeric: true }));
    res.json({ success: true, data: students });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/attendance
router.get('/attendance', teacherProtect, (req, res) => {
  try {
    const { date, class: cls, section } = req.query;
    const c = cls || req.teacher.assignedClass;
    const s = section || req.teacher.assignedSection || 'A';
    res.json({ success: true, data: attOps.query({ date, cls: c, section: s }) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-panel/attendance
router.post('/attendance', teacherProtect, async (req, res) => {
  try {
    const { date, records } = req.body;
    const cls     = req.teacher.assignedClass;
    const section = req.teacher.assignedSection || 'A';
    if (!date || !Array.isArray(records) || !records.length)
      return res.status(400).json({ success: false, message: 'date and records[] are required.' });
    if (!cls) return res.status(400).json({ success: false, message: 'Teacher has no assigned class.' });

    const newRecs = records.map(r => ({
      _id: newId(), rollNo: r.rollNo, studentName: r.studentName||'',
      date, class: cls, section, status: r.status||'Present',
      markedBy: req.teacher.name||req.teacher.username, createdAt: new Date().toISOString()
    }));
    attOps.replaceBulk(date, cls, section, newRecs);

    let waSent = 0;
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    if (waToken && waPhoneId) {
      for (const a of newRecs.filter(r => r.status === 'Absent')) {
        const sr = db.prepare('SELECT json_data FROM students WHERE rollNo=?').get(a.rollNo);
        const ph = sr ? JSON.parse(sr.json_data).fatherPhone : null;
        if (!ph) continue;
        try {
          const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${waToken}`},
            body: JSON.stringify({ messaging_product:'whatsapp', to: ph.replace(/[^0-9]/g,''), type:'text', text:{ body:`Dear Parent, *${a.studentName}* was *Absent* today (${date}).\nClass ${cls}-${section} — MMPC D.I. Khan` } })
          });
          if (r.ok) waSent++;
        } catch(_) {}
      }
    }
    res.json({ success: true, message: `Saved ${newRecs.length} records. WA sent: ${waSent}` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/homework
router.get('/homework', teacherProtect, (req, res) => {
  try {
    const { assignedClass: cls, assignedSection } = req.teacher;
    const sec = assignedSection || 'A';
    const data = db.prepare('SELECT json_data FROM homework WHERE class=? AND section=? ORDER BY createdAt DESC').all(cls, sec).map(r=>JSON.parse(r.json_data));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-panel/homework
router.post('/homework', teacherProtect, (req, res) => {
  try {
    const { subject, description, dueDate } = req.body;
    if (!subject||!description) return res.status(400).json({ success: false, message: 'subject and description are required.' });
    const item = { _id: newId(), subject, description, dueDate: dueDate||'', class: req.teacher.assignedClass, section: req.teacher.assignedSection||'A', postedBy: req.teacher.name||req.teacher.username, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO homework(_id,class,section,json_data,createdAt) VALUES (?,?,?,?,?)').run(item._id, item.class, item.section, JSON.stringify(item), item.createdAt);
    res.status(201).json({ success: true, data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/teacher-panel/homework/:id
router.delete('/homework/:id', teacherProtect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM homework WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/results
router.get('/results', teacherProtect, (req, res) => {
  try {
    const { exam, year } = req.query;
    let sql = 'SELECT json_data FROM results WHERE class=?';
    const p = [req.teacher.assignedClass];
    if (exam) { sql += ' AND exam=?'; p.push(exam); }
    if (year) { sql += ' AND year=?'; p.push(year); }
    res.json({ success: true, data: db.prepare(sql).all(...p).map(r=>JSON.parse(r.json_data)) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
