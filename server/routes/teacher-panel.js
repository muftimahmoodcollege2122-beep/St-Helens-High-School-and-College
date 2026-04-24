// ── Teacher Panel API ─────────────────────────────────────────────────────────
const router            = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { teacherProtect } = require('../middleware/teacherAuth');

// GET /api/teacher-panel/students — assigned class students
router.get('/students', teacherProtect, (req, res) => {
  try {
    const { assignedClass, assignedSection } = req.teacher;
    if (!assignedClass) {
      return res.json({ success: true, data: [], message: 'No class assigned to this teacher account.' });
    }
    let students = readDB('students').filter(s => s.status === 'Active' || !s.status);
    students = students.filter(s => s.class === assignedClass);
    if (assignedSection) students = students.filter(s => (s.section || 'A') === assignedSection);
    students.sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '', undefined, { numeric: true }));
    res.json({ success: true, data: students });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/attendance
router.get('/attendance', teacherProtect, (req, res) => {
  try {
    const { date, class: cls, section } = req.query;
    const c = cls     || req.teacher.assignedClass;
    const s = section || req.teacher.assignedSection || 'A';
    let data = readDB('attendance');
    if (date) data = data.filter(a => a.date    === date);
    if (c)    data = data.filter(a => a.class   === c);
    if (s)    data = data.filter(a => a.section === s);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-panel/attendance
router.post('/attendance', teacherProtect, async (req, res) => {
  try {
    const { date, records } = req.body;
    const cls     = req.teacher.assignedClass;
    const section = req.teacher.assignedSection || 'A';

    if (!date || !Array.isArray(records) || !records.length) {
      return res.status(400).json({ success: false, message: 'date and records[] are required.' });
    }
    if (!cls) {
      return res.status(400).json({ success: false, message: 'Teacher has no assigned class.' });
    }

    let all = readDB('attendance');
    all = all.filter(a => !(a.date === date && a.class === cls && a.section === section));

    const newRecs = records.map(r => ({
      _id:         newId(),
      rollNo:      r.rollNo,
      studentName: r.studentName || '',
      date,
      class:       cls,
      section,
      status:      r.status || 'Present',
      markedBy:    req.teacher.name || req.teacher.username,
      createdAt:   new Date().toISOString()
    }));

    all.push(...newRecs);
    writeDB('attendance', all);

    // Optional WhatsApp for absentees
    let waSent = 0;
    const waToken   = process.env.WA_TOKEN;
    const waPhoneId = process.env.WA_PHONE_ID;
    if (waToken && waPhoneId) {
      const allStudents = readDB('students');
      const absentees   = newRecs.filter(r => r.status === 'Absent');
      for (const a of absentees) {
        const st = allStudents.find(s => s.rollNo === a.rollNo);
        const ph = st?.fatherPhone;
        if (!ph) continue;
        const to  = ph.replace(/[^0-9]/g, '');
        const msg = `Dear Parent, *${a.studentName}* was *Absent* today (${date}).\nClass ${cls}-${section} — MMPC D.I. Khan`;
        try {
          const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${waToken}` },
            body:    JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: msg } })
          });
          if (r.ok) waSent++;
        } catch (_) {}
      }
    }

    res.json({ success: true, message: `Saved ${newRecs.length} records. WA sent: ${waSent}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/homework
router.get('/homework', teacherProtect, (req, res) => {
  try {
    const cls     = req.teacher.assignedClass;
    const section = req.teacher.assignedSection || 'A';
    const data    = readDB('homework')
      .filter(h => h.class === cls && h.section === section)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/teacher-panel/homework
router.post('/homework', teacherProtect, (req, res) => {
  try {
    const { subject, description, dueDate } = req.body;
    if (!subject || !description) {
      return res.status(400).json({ success: false, message: 'subject and description are required.' });
    }
    const all  = readDB('homework');
    const item = {
      _id:         newId(),
      subject,
      description,
      dueDate:     dueDate || '',
      class:       req.teacher.assignedClass,
      section:     req.teacher.assignedSection || 'A',
      postedBy:    req.teacher.name || req.teacher.username,
      createdAt:   new Date().toISOString()
    };
    all.push(item);
    writeDB('homework', all);
    res.status(201).json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/teacher-panel/homework/:id
router.delete('/homework/:id', teacherProtect, (req, res) => {
  try {
    let all = readDB('homework');
    const idx = all.findIndex(h => h._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
    all.splice(idx, 1);
    writeDB('homework', all);
    res.json({ success: true, message: 'Deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/teacher-panel/results
router.get('/results', teacherProtect, (req, res) => {
  try {
    const { exam, year } = req.query;
    let data = readDB('results').filter(r => r.class === req.teacher.assignedClass);
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
