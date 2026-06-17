const router      = require('express').Router();
const { db, newId, attOps } = require('../db');
const { protect } = require('../middleware/auth');

// GET /api/attendance
router.get('/', protect, (req, res) => {
  try {
    const { date, class: cls, section } = req.query;
    res.json({ success: true, data: attOps.query({ date, cls, section }) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/students
router.get('/students', protect, (req, res) => {
  try {
    const { class: cls, section } = req.query;
    if (!cls) return res.status(400).json({ success: false, message: '"class" is required.' });
    let sql = "SELECT json_data FROM students WHERE class=? AND (status='Active' OR status IS NULL)";
    const p = [cls];
    if (section) { sql += ' AND section=?'; p.push(section); }
    const students = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data))
      .sort((a,b) => (a.rollNo||'').localeCompare(b.rollNo||'', undefined, { numeric: true }));
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

// GET /api/attendance/years
router.get('/years', protect, (req, res) => {
  try {
    res.json({ success: true, data: attOps.countByYear() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/student/:rollNo
router.get('/student/:rollNo', protect, (req, res) => {
  try {
    const { month } = req.query;
    res.json({ success: true, data: attOps.studentHistory(req.params.rollNo, month) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/attendance/bulk
router.post('/bulk', protect, async (req, res) => {
  try {
    const { date, class: cls, section, records } = req.body;
    if (!date || !cls || !Array.isArray(records) || !records.length)
      return res.status(400).json({ success: false, message: 'date, class and records[] are required.' });

    const sec = section || 'A';
    const activeRollNos = new Set(
      db.prepare("SELECT json_data FROM students WHERE class=? AND (status='Active' OR status IS NULL)").all(cls)
        .map(r => JSON.parse(r.json_data).rollNo)
    );

    const newRecords = records
      .filter(r => activeRollNos.has(r.rollNo))
      .map(r => ({
        _id: newId(), rollNo: r.rollNo, studentName: r.studentName||'',
        date, class: cls, section: sec, status: r.status||'Present',
        markedBy: req.user?.username||'admin', createdAt: new Date().toISOString()
      }));

    attOps.replaceBulk(date, cls, sec, newRecords);

    let waSent = 0;
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    if (waToken && waPhoneId) {
      const absentees = newRecords.filter(r => r.status === 'Absent');
      for (const a of absentees) {
        const sr = db.prepare('SELECT json_data FROM students WHERE rollNo=?').get(a.rollNo);
        const phone = sr ? JSON.parse(sr.json_data).fatherPhone : null;
        if (!phone) continue;
        try {
          const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json','Authorization':`Bearer ${waToken}` },
            body: JSON.stringify({ messaging_product:'whatsapp', to: phone.replace(/[^0-9]/g,''), type:'text', text:{ body:`Dear Parent, your child *${a.studentName}* was *Absent* today (${date}).\nPlease contact school if needed.\n— MMPC D.I. Khan` } })
          });
          if (r.ok) waSent++;
        } catch(_) {}
      }
    }

    res.status(201).json({ success: true, message: `Attendance saved for ${newRecords.length} students. WhatsApp alerts: ${waSent}`, data: newRecords });
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

// DELETE /api/attendance/year/:year
router.delete('/year/:year', protect, (req, res) => {
  try {
    const year = req.params.year;
    if (!/^\d{4}$/.test(year)) return res.status(400).json({ success: false, message: 'Invalid year. Use YYYY.' });
    const deleted = attOps.deleteYear(year);
    res.json({ success: true, message: `Deleted ${deleted} records for ${year}.`, deleted });
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

// GET /api/attendance/export/csv
router.get('/export/csv', protect, (req, res) => {
  try {
    const rows = db.prepare('SELECT json_data FROM attendance ORDER BY date DESC').all().map(r => JSON.parse(r.json_data));
    if (!rows.length) return res.send('No data');
    const keys = ['_id','rollNo','studentName','class','section','date','status','markedBy','createdAt'];
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=attendance.csv');
    res.send(keys.join(',') + '\n' + rows.map(r => keys.map(k=>`"${String(r[k]||'').replace(/"/g,'""')}"`).join(',')).join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
