// ── Fees ──────────────────────────────────────────────────────────────────────
const router         = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { protect }    = require('../middleware/auth');

// Populate student details into a fee record
function populate(fee) {
  const students = readDB('students');
  const s = students.find(st => st._id === fee.student) || {};
  return {
    ...fee,
    student: {
      _id:        s._id        || fee.student,
      name:       s.name       || '-',
      rollNo:     s.rollNo     || '-',
      class:      s.class      || '-',
      section:    s.section    || '',
      fatherName: s.fatherName || '-',
      fatherPhone:s.fatherPhone|| ''
    }
  };
}

// GET /api/fees
router.get('/', protect, (req, res) => {
  try {
    const { status, month, class: cls } = req.query;
    let fees = readDB('fees');
    if (status) fees = fees.filter(f => f.status === status);
    if (month)  fees = fees.filter(f => f.month  === month);
    let data = fees.map(populate);
    if (cls)    data = data.filter(f => f.student.class === cls);
    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data, total: data.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees  (single record)
router.post('/', protect, (req, res) => {
  try {
    const { student, month, amount, dueDate, note } = req.body;
    if (!student || !month || !amount || !dueDate) {
      return res.status(400).json({ success: false, message: 'student, month, amount, dueDate are required.' });
    }
    const all = readDB('fees');
    // Prevent duplicate fee for same student+month
    if (all.find(f => f.student === student && f.month === month)) {
      return res.status(409).json({ success: false, message: `Fee for this student in "${month}" already exists.` });
    }
    const fee = {
      _id:        newId(),
      student,
      month,
      amount:     parseFloat(amount),
      dueDate,
      status:     'Unpaid',
      paidAmount: 0,
      note:       note || '',
      createdAt:  new Date().toISOString()
    };
    all.push(fee);
    writeDB('fees', all);
    res.status(201).json({ success: true, data: populate(fee) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/bulk  (generate fees for a whole class)
router.post('/bulk', protect, (req, res) => {
  try {
    const { month, amount, dueDate, class: cls } = req.body;
    if (!month || !amount || !dueDate) {
      return res.status(400).json({ success: false, message: 'month, amount, dueDate are required.' });
    }
    let students = readDB('students').filter(s => s.status === 'Active' || !s.status);
    if (cls) students = students.filter(s => s.class === cls);

    const all = readDB('fees');
    // Skip students who already have a fee for this month
    const existing = new Set(all.filter(f => f.month === month).map(f => f.student));

    const docs = students
      .filter(s => !existing.has(s._id))
      .map(s => ({
        _id:        newId(),
        student:    s._id,
        month,
        amount:     parseFloat(amount),
        dueDate,
        status:     'Unpaid',
        paidAmount: 0,
        note:       '',
        createdAt:  new Date().toISOString()
      }));

    docs.forEach(d => all.push(d));
    writeDB('fees', all);
    res.json({ success: true, message: `${docs.length} fee records created (${students.length - docs.length} skipped as duplicates).` });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/fees/bulk/delete  — bulk delete fees (MUST be before /:id)
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, month, deleteAll } = req.body;
    let all = readDB('fees');
    const before = all.length;
    if (deleteAll) {
      all = [];
    } else if (Array.isArray(ids) && ids.length) {
      const idSet = new Set(ids);
      all = all.filter(f => !idSet.has(f._id));
    } else if (month) {
      all = all.filter(f => f.month !== month);
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, month, or deleteAll:true' });
    }
    writeDB('fees', all);
    res.json({ success: true, message: `Deleted ${before - all.length} fee record(s).`, deleted: before - all.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/bulk/import  — direct SQL upsert, chunked-safe
router.post('/bulk/import', protect, (req, res) => {
  try {
    const { rows, overwrite } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ success: false, message: 'No rows provided.' });

    const { db } = require('../db');
    const added = [], skipped = [], errors = [];

    const tx = db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo  = (row.rollNo || row.roll_no || row['Roll No'] || '').toString().trim();
          const month   = (row.month  || row.Month   || '').toString().trim();
          const amount  = parseFloat(row.amount || row.Amount || 0);
          const dueDate = (row.dueDate || row.due_date || row['Due Date'] || '').toString().trim();
          const note    = (row.note   || row.Note    || '').toString().trim();

          if (!rollNo || !month || !amount || !dueDate) {
            errors.push(`Row ${idx+2}: Missing rollNo, month, amount or dueDate.`); return;
          }

          // Look up student by rollNo
          const studentRow = db.prepare('SELECT _id FROM students WHERE rollNo=?').get(rollNo);
          if (!studentRow) { errors.push(`Row ${idx+2}: Student Roll No "${rollNo}" not found.`); return; }
          const studentId = studentRow._id;

          const existing = db.prepare('SELECT _id FROM fees WHERE student_id=? AND month=?').get(studentId, month);
          if (existing) {
            if (overwrite) {
              const upd = { _id: existing._id, student: studentId, month, amount, dueDate, status: 'Unpaid', paidAmount: 0, note, createdAt: new Date().toISOString() };
              db.prepare('UPDATE fees SET month=?,status=?,json_data=? WHERE _id=?')
                .run(month, 'Unpaid', JSON.stringify(upd), existing._id);
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} month ${month} updated.`);
            } else {
              skipped.push(`Row ${idx+2}: Roll No ${rollNo} month ${month} already exists — skipped.`);
            }
            return;
          }

          const item = { _id: newId(), student: studentId, month, amount, dueDate, status: 'Unpaid', paidAmount: 0, note, createdAt: new Date().toISOString() };
          db.prepare('INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (?,?,?,?,?,?)')
            .run(item._id, studentId, month, 'Unpaid', JSON.stringify(item), item.createdAt);
          added.push(`${rollNo}/${month}`);
        } catch (e) { errors.push(`Row ${idx+2}: ${e.message}`); }
      });
    });
    tx();

    res.json({ success: true, message: `Import complete. Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`, added: added.length, skipped: skipped.length, errors });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
// PATCH /api/fees/:id  (mark paid / update)
router.patch('/:id', protect, (req, res) => {
  try {
    const all = readDB('fees');
    const idx = all.findIndex(f => f._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Fee record not found.' });
    all[idx] = { ...all[idx], ...req.body, _id: req.params.id };
    writeDB('fees', all);
    res.json({ success: true, data: populate(all[idx]) });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/fees/:id
router.delete('/:id', protect, (req, res) => {
  try {
    let all = readDB('fees');
    const idx = all.findIndex(f => f._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Fee record not found.' });
    all.splice(idx, 1);
    writeDB('fees', all);
    res.json({ success: true, message: 'Deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/whatsapp/send  (single reminder)
router.post('/whatsapp/send', protect, async (req, res) => {
  try {
    const { message, phone } = req.body;
    const token   = process.env.WA_TOKEN;
    const phoneId = process.env.WA_PHONE_ID;
    if (!token || !phoneId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured. Set WA_TOKEN and WA_PHONE_ID in .env' });
    }
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'phone and message are required.' });
    }
    const to    = phone.replace(/[^0-9]/g, '');
    const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } })
    });
    const data = await waRes.json();
    if (!waRes.ok) return res.status(400).json({ success: false, message: data.error?.message || 'WhatsApp error.' });
    res.json({ success: true, message: 'Message sent.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/whatsapp/remind-all
router.post('/whatsapp/remind-all', protect, async (req, res) => {
  try {
    const { month, messageTemplate } = req.body;
    const token   = process.env.WA_TOKEN;
    const phoneId = process.env.WA_PHONE_ID;
    if (!token || !phoneId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured.' });
    }
    if (!month || !messageTemplate) {
      return res.status(400).json({ success: false, message: 'month and messageTemplate required.' });
    }
    const fees = readDB('fees').filter(f => f.status === 'Unpaid' && f.month === month).map(populate);
    let sent = 0, failed = 0;
    for (const fee of fees) {
      const phone = fee.student?.fatherPhone;
      if (!phone) { failed++; continue; }
      const msg = messageTemplate
        .replace('{name}',   fee.student.name)
        .replace('{month}',  fee.month)
        .replace('{amount}', fee.amount);
      const to = phone.replace(/[^0-9]/g, '');
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: msg } })
        });
        waRes.ok ? sent++ : failed++;
      } catch (_) { failed++; }
    }
    res.json({ success: true, message: `Sent: ${sent}, Failed: ${failed}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── CSV Export ────────────────────────────────────────────────────────────────
router.get('/export/csv', protect, (req, res) => {
  try {
    const fees = readDB('fees');
    const students = readDB('students');
    if (!fees.length) return res.send('No data');
    const keys = ['_id','student','month','amount','status','paidDate','createdAt'];
    const header = ['ID','StudentName','Month','Amount','Status','PaidDate','CreatedAt'].join(',');
    const rows = fees.map(f => {
      const s = students.find(st => st._id === f.student) || {};
      return [f._id, s.name||'', f.month||'', f.amount||'', f.status||'', f.paidDate||'', f.createdAt||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=fees.csv');
    res.send(header + '\n' + rows.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
