const router  = require('express').Router();
const { readDB, writeDB, newId, attOps } = require('../db');
const { teacherProtect } = require('../middleware/teacherAuth');

router.get('/students', teacherProtect, (req, res) => {
  try {
    const { assignedClass, assignedSection } = req.teacher;
    if (!assignedClass) return res.json({ success: true, data: [], message: 'No class assigned.' });
    let students = readDB('students').filter(s => s.class === assignedClass && (s.status === 'Active' || !s.status));
    if (assignedSection) students = students.filter(s => s.section === assignedSection);
    students.sort((a,b) => (a.rollNo||'').localeCompare(b.rollNo||'', undefined, { numeric: true }));
    res.json({ success: true, data: students });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/attendance', teacherProtect, (req, res) => {
  try {
    const { date, class: cls, section } = req.query;
    const c = cls || req.teacher.assignedClass;
    const s = section || req.teacher.assignedSection || 'A';
    res.json({ success: true, data: attOps.query({ date, cls: c, section: s }) });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

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
      const allStudents = readDB('students');
      for (const a of newRecs.filter(r => r.status === 'Absent')) {
        const sr = allStudents.find(s => s.rollNo === a.rollNo);
        const ph = sr ? sr.fatherPhone : null;
        if (!ph) continue;
        try {
          const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${waToken}`},
            body: JSON.stringify({ messaging_product:'whatsapp', to: ph.replace(/[^0-9]/g,''), type:'text', text:{ body:`Dear Parent, *${a.studentName}* was *Absent* today (${date}).\nClass ${cls}-${section} — St. Helen's High School & College` } })
          });
          if (r.ok) waSent++;
        } catch(_) {}
      }
    }
    res.json({ success: true, message: `Saved ${newRecs.length} records. WA sent: ${waSent}` });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/homework', teacherProtect, (req, res) => {
  try {
    const { assignedClass: cls, assignedSection } = req.teacher;
    const sec = assignedSection || 'A';
    const data = readDB('homework').filter(h => h.class === cls && h.section === sec)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/homework', teacherProtect, (req, res) => {
  try {
    const { subject, description, dueDate } = req.body;
    if (!subject||!description) return res.status(400).json({ success: false, message: 'subject and description are required.' });
    const item = { _id: newId(), subject, description, dueDate: dueDate||'', class: req.teacher.assignedClass, section: req.teacher.assignedSection||'A', postedBy: req.teacher.name||req.teacher.username, createdAt: new Date().toISOString() };
    const data = readDB('homework'); data.push(item); writeDB('homework', data);
    res.status(201).json({ success: true, data: item });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/homework/:id', teacherProtect, (req, res) => {
  try {
    const data = readDB('homework');
    if (!data.find(h => h._id === req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
    writeDB('homework', data.filter(h => h._id !== req.params.id));
    res.json({ success: true, message: 'Deleted.' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/results', teacherProtect, (req, res) => {
  try {
    const { exam, year } = req.query;
    let data = readDB('results').filter(r => r.class === req.teacher.assignedClass);
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
