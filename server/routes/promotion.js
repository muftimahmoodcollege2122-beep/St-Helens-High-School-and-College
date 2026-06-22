const router = require('express').Router();
const { readDB, writeDB } = require('../db');
const { protect } = require('../middleware/auth');

const CLASS_LADDER = ['1','2','3','4','5','6','7','8','9','10','11','12'];

router.get('/preview', protect, (req, res) => {
  try {
    const { fromClass } = req.query;
    const students = readDB('students').filter(s => s.status === 'Active' && (!fromClass || s.class === fromClass));
    const preview = students.map(s => {
      const idx = CLASS_LADDER.indexOf(String(s.class));
      const nextClass = idx !== -1 && idx < CLASS_LADDER.length - 1 ? CLASS_LADDER[idx + 1] : null;
      return { _id: s._id, name: s.name, rollNo: s.rollNo, class: s.class, section: s.section, nextClass, action: nextClass ? 'promote' : 'passed-out' };
    });
    res.json({ success:true, data: preview });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/promote', protect, (req, res) => {
  try {
    const { fromClass, markPassedOutAsAlumni = true } = req.body;
    if (!fromClass) return res.status(400).json({ success:false, message:'fromClass required.' });

    const students = readDB('students');
    const alumni = readDB('alumni');
    const now = new Date().toISOString();
    const year = new Date().getFullYear().toString();
    let promoted = 0, passedOut = 0;

    students.forEach(s => {
      if (s.class !== fromClass || s.status !== 'Active') return;
      const idx = CLASS_LADDER.indexOf(String(s.class));
      if (idx === -1) return;

      if (idx < CLASS_LADDER.length - 1) {
        s.class = CLASS_LADDER[idx + 1];
        s.promotedAt = now;
        promoted++;
      } else {
        // Class 12 — passed out
        s.status = 'Passed Out';
        s.passedOutAt = now;
        passedOut++;
        if (markPassedOutAsAlumni) {
          alumni.push({
            _id: require('../db').newId(),
            name: s.name, rollNo: s.rollNo, fatherName: s.fatherName,
            phone: s.fatherPhone, batch: year, status: 'Approved', public: 'Yes',
            class: s.class, createdAt: now
          });
        }
      }
    });

    writeDB('students', students);
    if (markPassedOutAsAlumni && passedOut > 0) writeDB('alumni', alumni);
    res.json({ success:true, promoted, passedOut, message:`${promoted} promoted, ${passedOut} passed out${markPassedOutAsAlumni && passedOut ? ' (added to alumni)' : ''}.` });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
