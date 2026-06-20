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
    if (cls)     data = data.filter(r => r.class === cls);
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

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('fees');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('fees', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk', protect, (req,res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : req.body.fees;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'Array required.' });
    const data = readDB('fees');
    const added = incoming.map(f => { const item={_id:newId(),status:'Unpaid',...f,createdAt:new Date().toISOString()}; data.push(item); return item; });
    writeDB('fees', data);
    res.json({ success:true, added:added.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk/import', protect, (req,res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : req.body.fees;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'Array required.' });
    const data = readDB('fees');
    const added = incoming.map(f => { const item={_id:newId(),status:'Unpaid',...f,createdAt:new Date().toISOString()}; data.push(item); return item; });
    writeDB('fees', data);
    res.json({ success:true, added:added.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { month, deleteAll } = req.body;
    let data = readDB('fees');
    const before = data.length;
    if (deleteAll) data = [];
    else if (month) data = data.filter(r => r.month !== month);
    else return res.status(400).json({ success:false, message:'month or deleteAll required.' });
    writeDB('fees', data);
    res.json({ success:true, deleted: before - data.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/whatsapp/send', protect, async (req,res) => {
  try {
    const { feeId, phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ success:false, message:'phone and message required.' });
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    if (!waToken || !waPhoneId) return res.status(400).json({ success:false, message:'WhatsApp not configured.' });
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
    const waToken = process.env.WA_TOKEN, waPhoneId = process.env.WA_PHONE_ID;
    if (!waToken || !waPhoneId) return res.status(400).json({ success:false, message:'WhatsApp not configured.' });
    let fees = readDB('fees').filter(f => f.status === 'Unpaid');
    if (month) fees = fees.filter(f => f.month === month);
    const students = readDB('students');
    let sent = 0;
    for (const f of fees) {
      const sr = students.find(s => s._id === f.student || s.rollNo === f.student);
      const ph = sr ? sr.fatherPhone : null;
      if (!ph) continue;
      const msg = (messageTemplate || 'Dear Parent, fee for {month} is unpaid. Please pay at your earliest.').replace('{month}', f.month||'');
      try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${waToken}`},
          body: JSON.stringify({ messaging_product:'whatsapp', to: ph.replace(/[^0-9]/g,''), type:'text', text:{ body: msg } })
        });
        if (r.ok) sent++;
      } catch(_) {}
    }
    res.json({ success:true, sent });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
