const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', protect, (req,res) => {
  try {
    const { student, month, status, class:cls } = req.query;
    let data = readDB('fees');
    if (student) data = data.filter(r => r.student === student || r.rollNo === student);
    if (month)   data = data.filter(r => r.month === month);
    if (status)  data = data.filter(r => r.status === status);
    const students = readDB('students');
    data = data.map(f => {
      const s = students.find(x => x._id === f.student || x.rollNo === f.student);
      return { ...f, student: s ? { rollNo:s.rollNo, name:s.name, fatherName:s.fatherName, class:s.class, section:s.section, fatherPhone:s.fatherPhone } : null };
    });
    if (cls) data = data.filter(r => r.student && r.student.class === cls);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res) => {
  try {
    const item = { _id:newId(), status:'Unpaid', ...req.body, createdAt:new Date().toISOString() };
    const data = readDB('fees'); data.push(item); writeDB('fees', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/whatsapp/send', protect, async (req,res) => {
  try {
    const { feeId, phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ success:false, message:'phone and message required.' });
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    if (feeId) {
      const data = readDB('fees');
      const idx = data.findIndex(r => r._id === feeId);
      if (idx !== -1) { data[idx].lastReminderAt = new Date().toISOString(); writeDB('fees', data); }
    }
    if (!waToken || !waPhoneId) {
      const waLink = `https://wa.me/${phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(message)}`;
      return res.json({ success:true, message:'WhatsApp API not configured — use this link instead.', waLink });
    }
    const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${waToken}`},
      body: JSON.stringify({ messaging_product:'whatsapp', to: phone.replace(/[^0-9]/g,''), type:'text', text:{ body: message } })
    });
    if (!r.ok) return res.status(502).json({ success:false, message:'WhatsApp send failed.' });
    res.json({ success:true, message:'Sent.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/whatsapp/remind-all', protect, async (req,res) => {
  try {
    const { month, messageTemplate } = req.body;
    if (!month || !messageTemplate) return res.status(400).json({ success:false, message:'month and messageTemplate required.' });
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    let fees = readDB('fees').filter(f => f.month === month && f.status !== 'Paid');
    const students = readDB('students');
    const now = new Date().toISOString();
    let sent = 0;

    if (!waToken || !waPhoneId) {
      const all = readDB('fees');
      fees.forEach(f => { const idx = all.findIndex(x=>x._id===f._id); if (idx!==-1) all[idx].lastReminderAt = now; });
      writeDB('fees', all);
      return res.json({ success:true, message:`WhatsApp API not configured — ${fees.length} reminder(s) logged for ${month} instead of sent.`, count: fees.length });
    }

    for (const f of fees) {
      const sr = students.find(s => s._id === f.student || s.rollNo === f.student);
      const ph = sr ? sr.fatherPhone : null;
      if (!ph) continue;
      const msg = messageTemplate.replace('{month}', f.month||'');
      try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${waToken}`},
          body: JSON.stringify({ messaging_product:'whatsapp', to: ph.replace(/[^0-9]/g,''), type:'text', text:{ body: msg } })
        });
        if (r.ok) sent++;
      } catch(_) {}
    }
    const all = readDB('fees');
    fees.forEach(f => { const idx = all.findIndex(x=>x._id===f._id); if (idx!==-1) all[idx].lastReminderAt = now; });
    writeDB('fees', all);
    res.json({ success:true, message:`${sent} reminder(s) sent for ${month}.`, sent });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { deleteAll, month } = req.body;
    const data = readDB('fees');
    let kept, deleted;
    if (deleteAll) { deleted = data.length; kept = []; }
    else if (month) { kept = data.filter(r => r.month !== month); deleted = data.length - kept.length; }
    else return res.status(400).json({ success:false, message:'deleteAll or month required.' });
    writeDB('fees', kept);
    res.json({ success:true, deleted });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk/import', protect, (req,res) => {
  try {
    const incoming = req.body.rows || (Array.isArray(req.body) ? req.body : req.body.fees);
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'rows array required.' });
    const data = readDB('fees');
    const added = incoming.map(f => { const item={_id:newId(),status:'Unpaid',...f,createdAt:new Date().toISOString()}; data.push(item); return item; });
    writeDB('fees', data);
    res.json({ success:true, added:added.length, skipped:0, errors:[] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.patch('/:id/verify-payment', protect, (req,res) => {
  try {
    const { approve } = req.body;
    const data = readDB('fees');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    if (!data[idx].paymentSubmission) return res.status(400).json({ success:false, message:'No payment submission to verify.' });
    if (approve) {
      data[idx].status = 'Paid';
      data[idx].paymentSubmission.verified = true;
      data[idx].paidAt = new Date().toISOString();
    } else {
      data[idx].status = 'Unpaid';
      data[idx].paymentSubmission.verified = false;
      data[idx].paymentSubmission.rejected = true;
    }
    writeDB('fees', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('fees');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('fees', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.patch('/:id', protect, (req,res) => {
  try {
    const data = readDB('fees');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('fees', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('fees');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('fees', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
