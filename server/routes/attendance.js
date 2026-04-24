// ── Attendance ────────────────────────────────────────────────────────────────
const router      = require('express').Router();
const { readDB, writeDB, newId, attOps } = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/attendance
router.get('/', protect, (req, res) => {
  try {
    const { date, class: cls, section } = req.query;
    const data = attOps.query({ date, cls, section });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/students — active students for a class
router.get('/students', protect, (req, res) => {
  try {
    const { class: cls, section } = req.query;
    if (!cls) return res.status(400).json({ success: false, message: '"class" query param is required.' });
    let students = readDB('students').filter(s => s.class === cls && (s.status === 'Active' || !s.status));
    if (section) students = students.filter(s => (s.section || 'A') === section);
    students.sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '', undefined, { numeric: true }));
    res.json({ success: true, data: students });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/summary
router.get('/summary', protect, (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    res.json({ success: true, data: attOps.summary(today) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/years — list years that have records
router.get('/years', protect, (req, res) => {
  try {
    res.json({ success: true, data: attOps.countByYear() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/student/:rollNo
router.get('/student/:rollNo', protect, (req, res) => {
  try {
    const { month } = req.query;
    const data = attOps.studentHistory(req.params.rollNo, month);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/attendance/bulk — save attendance for a class
router.post('/bulk', protect, async (req, res) => {
  try {
    const { date, class: cls, section, records } = req.body;
    if (!date || !cls || !Array.isArray(records) || records.length === 0)
      return res.status(400).json({ success: false, message: 'date, class and records[] are required.' });

    const allStudents   = readDB('students');
    const activeRollNos = new Set(
      allStudents.filter(s => s.class === cls && (s.status === 'Active' || !s.status)).map(s => s.rollNo)
    );
    const sec = section || 'A';

    const newRecords = records
      .filter(r => activeRollNos.has(r.rollNo))
      .map(r => ({
        _id:         newId(),
        rollNo:      r.rollNo,
        studentName: r.studentName || '',
        date,
        class:       cls,
        section:     sec,
        status:      r.status || 'Present',
        markedBy:    req.user?.username || 'admin',
        createdAt:   new Date().toISOString()
      }));

    // Fast targeted INSERT — no full-table rewrite
    attOps.replaceBulk(date, cls, sec, newRecords);

    // Optional WhatsApp alerts for absentees
    let waSent = 0;
    const waToken   = process.env.WA_TOKEN;
    const waPhoneId = process.env.WA_PHONE_ID;
    if (waToken && waPhoneId) {
      const absentees = newRecords.filter(r => r.status === 'Absent');
      for (const a of absentees) {
        const student = allStudents.find(s => s.rollNo === a.rollNo);
        const phone   = student?.fatherPhone;
        if (!phone) continue;
        const to  = phone.replace(/[^0-9]/g, '');
        const msg = `Dear Parent, your child *${a.studentName}* was *Absent* today (${date}).\nPlease contact school if needed.\n— MMPC D.I. Khan`;
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

    res.status(201).json({
      success: true,
      message: `Attendance saved for ${newRecords.length} students. WhatsApp alerts sent: ${waSent}`,
      data:    newRecords
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/attendance/year/:year — yearly archive delete
router.delete('/year/:year', protect, (req, res) => {
  try {
    const year = req.params.year;
    if (!/^\d{4}$/.test(year))
      return res.status(400).json({ success: false, message: 'Invalid year format. Use YYYY.' });
    const deleted = attOps.deleteYear(year);
    res.json({ success: true, message: `Deleted ${deleted} attendance records for year ${year}.`, deleted });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/attendance/:id
router.patch('/:id', protect, (req, res) => {
  try {
    const updated = attOps.updateRecord(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Record not found.' });
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/attendance/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const ok = attOps.deleteOne(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Record not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;

// ── CSV Export ────────────────────────────────────────────────────────────────
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = readDB('attendance');
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','name','class','section','date','status','createdAt'];
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=attendance.csv');
    res.send(header + '\n' + csv.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});
