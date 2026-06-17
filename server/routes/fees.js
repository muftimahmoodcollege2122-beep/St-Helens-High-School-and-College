// ── Fees ──────────────────────────────────────────────────────────────────────
const router      = require('express').Router();
const { db, newId } = require('../db');
const { protect } = require('../middleware/auth');

function populate(fee) {
  const s = db.prepare('SELECT json_data FROM students WHERE _id=?').get(fee.student);
  const st = s ? JSON.parse(s.json_data) : {};
  return { ...fee, student: { _id: st._id||fee.student, name: st.name||'-', rollNo: st.rollNo||'-', class: st.class||'-', section: st.section||'', fatherName: st.fatherName||'-', fatherPhone: st.fatherPhone||'' } };
}

function getOne(id) {
  const row = db.prepare('SELECT json_data FROM fees WHERE _id=?').get(id);
  return row ? JSON.parse(row.json_data) : null;
}

// GET /api/fees
router.get('/', protect, (req, res) => {
  try {
    const { status, month, class: cls } = req.query;
    let sql = 'SELECT json_data FROM fees WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    if (month)  { sql += ' AND month=?';  p.push(month); }
    sql += ' ORDER BY createdAt DESC';
    let data = db.prepare(sql).all(...p).map(r => JSON.parse(r.json_data)).map(populate);
    if (cls) data = data.filter(f => f.student.class === cls);
    res.json({ success: true, data, total: data.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees
router.post('/', protect, (req, res) => {
  try {
    const { student, month, amount, dueDate, note } = req.body;
    if (!student || !month || !amount || !dueDate)
      return res.status(400).json({ success: false, message: 'student, month, amount, dueDate are required.' });
    const dup = db.prepare('SELECT _id FROM fees WHERE student_id=? AND month=?').get(student, month);
    if (dup) return res.status(409).json({ success: false, message: `Fee for this student in "${month}" already exists.` });
    const fee = { _id: newId(), student, month, amount: parseFloat(amount), dueDate, status: 'Unpaid', paidAmount: 0, note: note||'', createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (?,?,?,?,?,?)')
      .run(fee._id, student, month, 'Unpaid', JSON.stringify(fee), fee.createdAt);
    res.status(201).json({ success: true, data: populate(fee) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/bulk
router.post('/bulk', protect, (req, res) => {
  try {
    const { month, amount, dueDate, class: cls } = req.body;
    if (!month || !amount || !dueDate)
      return res.status(400).json({ success: false, message: 'month, amount, dueDate are required.' });
    let students = db.prepare('SELECT json_data FROM students WHERE status=?').all('Active').map(r => JSON.parse(r.json_data));
    if (cls) students = students.filter(s => s.class === cls);
    const existing = new Set(db.prepare('SELECT student_id FROM fees WHERE month=?').all(month).map(r => r.student_id));
    const ins = db.prepare('INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (?,?,?,?,?,?)');
    let count = 0;
    db.transaction(() => {
      students.filter(s => !existing.has(s._id)).forEach(s => {
        const fee = { _id: newId(), student: s._id, month, amount: parseFloat(amount), dueDate, status: 'Unpaid', paidAmount: 0, note: '', createdAt: new Date().toISOString() };
        ins.run(fee._id, s._id, month, 'Unpaid', JSON.stringify(fee), fee.createdAt);
        count++;
      });
    })();
    res.json({ success: true, message: `${count} fee records created (${students.length - count} skipped as duplicates).` });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/fees/bulk/delete
router.delete('/bulk/delete', protect, (req, res) => {
  try {
    const { ids, month, deleteAll } = req.body;
    let changes = 0;
    if (deleteAll) {
      changes = db.prepare('DELETE FROM fees').run().changes;
    } else if (Array.isArray(ids) && ids.length) {
      const del = db.prepare('DELETE FROM fees WHERE _id=?');
      db.transaction(() => { ids.forEach(id => { changes += del.run(id).changes; }); })();
    } else if (month) {
      changes = db.prepare('DELETE FROM fees WHERE month=?').run(month).changes;
    } else {
      return res.status(400).json({ success: false, message: 'Provide ids, month, or deleteAll:true' });
    }
    res.json({ success: true, message: `Deleted ${changes} fee record(s).`, deleted: changes });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/bulk/import
router.post('/bulk/import', protect, (req, res) => {
  try {
    const { rows, overwrite } = req.body;
    if (!Array.isArray(rows) || !rows.length)
      return res.status(400).json({ success: false, message: 'No rows provided.' });
    const added = [], skipped = [], errors = [];
    db.transaction(() => {
      rows.forEach((row, idx) => {
        try {
          const rollNo  = (row.rollNo||row['Roll No']||'').toString().trim();
          const month   = (row.month||row.Month||'').toString().trim();
          const amount  = parseFloat(row.amount||row.Amount||0);
          const dueDate = (row.dueDate||row['Due Date']||'').toString().trim();
          const note    = (row.note||'').toString().trim();
          if (!rollNo||!month||!amount||!dueDate) { errors.push(`Row ${idx+2}: Missing fields.`); return; }
          const studentRow = db.prepare('SELECT _id FROM students WHERE rollNo=?').get(rollNo);
          if (!studentRow) { errors.push(`Row ${idx+2}: Student "${rollNo}" not found.`); return; }
          const existing = db.prepare('SELECT _id FROM fees WHERE student_id=? AND month=?').get(studentRow._id, month);
          if (existing) {
            if (overwrite) {
              const upd = { _id: existing._id, student: studentRow._id, month, amount, dueDate, status:'Unpaid', paidAmount:0, note, createdAt: new Date().toISOString() };
              db.prepare('UPDATE fees SET month=?,status=?,json_data=? WHERE _id=?').run(month,'Unpaid',JSON.stringify(upd),existing._id);
              skipped.push(`Row ${idx+2}: updated.`);
            } else { skipped.push(`Row ${idx+2}: skipped.`); }
            return;
          }
          const item = { _id: newId(), student: studentRow._id, month, amount, dueDate, status:'Unpaid', paidAmount:0, note, createdAt: new Date().toISOString() };
          db.prepare('INSERT INTO fees(_id,student_id,month,status,json_data,createdAt) VALUES (?,?,?,?,?,?)').run(item._id,studentRow._id,month,'Unpaid',JSON.stringify(item),item.createdAt);
          added.push(`${rollNo}/${month}`);
        } catch(e) { errors.push(`Row ${idx+2}: ${e.message}`); }
      });
    })();
    res.json({ success: true, message: `Added: ${added.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`, added: added.length, skipped: skipped.length, errors });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/fees/:id
router.patch('/:id', protect, (req, res) => {
  try {
    const existing = getOne(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Fee record not found.' });
    const updated = { ...existing, ...req.body, _id: req.params.id };
    if (req.body.status === 'Paid' && !existing.paidDate) updated.paidDate = new Date().toISOString();
    db.prepare('UPDATE fees SET status=?,json_data=? WHERE _id=?').run(updated.status, JSON.stringify(updated), req.params.id);
    res.json({ success: true, data: populate(updated) });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/fees/:id
router.delete('/:id', protect, (req, res) => {
  try {
    const changes = db.prepare('DELETE FROM fees WHERE _id=?').run(req.params.id).changes;
    if (!changes) return res.status(404).json({ success: false, message: 'Fee record not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/whatsapp/send
router.post('/whatsapp/send', protect, async (req, res) => {
  try {
    const { message, phone } = req.body;
    const token = process.env.WA_TOKEN, phoneId = process.env.WA_PHONE_ID;
    if (!token||!phoneId) return res.status(400).json({ success: false, message: 'WhatsApp not configured.' });
    if (!phone||!message) return res.status(400).json({ success: false, message: 'phone and message required.' });
    const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ messaging_product:'whatsapp', to: phone.replace(/[^0-9]/g,''), type:'text', text:{body:message} }) });
    const data = await waRes.json();
    if (!waRes.ok) return res.status(400).json({ success: false, message: data.error?.message||'WhatsApp error.' });
    res.json({ success: true, message: 'Message sent.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/fees/whatsapp/remind-all
router.post('/whatsapp/remind-all', protect, async (req, res) => {
  try {
    const { month, messageTemplate } = req.body;
    const token = process.env.WA_TOKEN, phoneId = process.env.WA_PHONE_ID;
    if (!token||!phoneId) return res.status(400).json({ success: false, message: 'WhatsApp not configured.' });
    if (!month||!messageTemplate) return res.status(400).json({ success: false, message: 'month and messageTemplate required.' });
    const fees = db.prepare("SELECT json_data FROM fees WHERE status='Unpaid' AND month=?").all(month).map(r => populate(JSON.parse(r.json_data)));
    let sent = 0, failed = 0;
    for (const fee of fees) {
      const phone = fee.student?.fatherPhone;
      if (!phone) { failed++; continue; }
      const msg = messageTemplate.replace('{name}',fee.student.name).replace('{month}',fee.month).replace('{amount}',fee.amount);
      try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ messaging_product:'whatsapp', to: phone.replace(/[^0-9]/g,''), type:'text', text:{body:msg} }) });
        r.ok ? sent++ : failed++;
      } catch { failed++; }
    }
    res.json({ success: true, message: `Sent: ${sent}, Failed: ${failed}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/fees/export/csv
router.get('/export/csv', protect, (req, res) => {
  try {
    const fees = db.prepare('SELECT json_data FROM fees ORDER BY createdAt ASC').all().map(r => JSON.parse(r.json_data));
    const students = db.prepare('SELECT json_data FROM students').all().map(r => JSON.parse(r.json_data));
    if (!fees.length) return res.send('No data');
    const header = ['ID','StudentName','Month','Amount','Status','PaidDate','CreatedAt'].join(',');
    const rows = fees.map(f => {
      const s = students.find(st => st._id === f.student)||{};
      return [f._id,s.name||'',f.month||'',f.amount||'',f.status||'',f.paidDate||'',f.createdAt||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename=fees.csv');
    res.send(header+'\n'+rows.join('\n'));
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
