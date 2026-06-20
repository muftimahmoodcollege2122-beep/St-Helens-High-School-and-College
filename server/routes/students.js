const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', protect, (req,res) => {
  try {
    const { limit=50, page=1, class:cls, section, status, search } = req.query;
    let data = readDB('students');
    if (cls)    data = data.filter(r => r.class === cls);
    if (section) data = data.filter(r => r.section === section);
    if (status)  data = data.filter(r => r.status === status);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r => (r.name||'').toLowerCase().includes(q) || (r.rollNo||'').includes(q));
    }
    const total = data.length;
    const paged = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
    res.json({ success:true, data:paged, total, page:parseInt(page) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res) => {
  try {
    const { rollNo, name, fatherName, class:cls, section='A', gender, status='Active' } = req.body;
    if (!rollNo || !name) return res.status(400).json({ success:false, message:'Roll number and name required.' });
    const all = readDB('students');
    if (all.find(r => r.rollNo === rollNo)) return res.status(400).json({ success:false, message:'Roll number already exists.' });
    const item = { _id:newId(), rollNo, name, fatherName, class:cls, section, gender, status, ...req.body, createdAt:new Date().toISOString() };
    all.push(item); writeDB('students', all);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});





// Bulk import




router.post('/bulk/import', protect, (req,res) => {
  try {
    const incoming = req.body.rows || req.body.students;
    const overwrite = !!req.body.overwrite;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'rows array required.' });
    const existing = readDB('students');
    const byRoll = new Map(existing.map((r,i) => [r.rollNo, i]));
    let added = 0, skipped = 0;
    const errors = [];
    incoming.forEach(s => {
      if (!s.rollNo || !s.name) { errors.push(`Missing rollNo/name: ${JSON.stringify(s)}`); return; }
      if (byRoll.has(s.rollNo)) {
        if (overwrite) {
          const idx = byRoll.get(s.rollNo);
          existing[idx] = { ...existing[idx], ...s, _id: existing[idx]._id };
          added++;
        } else skipped++;
        return;
      }
      const item = { _id:newId(), section:'A', status:'Active', ...s, createdAt:new Date().toISOString() };
      existing.push(item); byRoll.set(s.rollNo, existing.length-1); added++;
    });
    writeDB('students', existing);
    res.json({ success:true, added, skipped, errors });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { deleteAll, class: cls } = req.body;
    const data = readDB('students');
    let kept, deleted;
    if (deleteAll) { deleted = data.length; kept = []; }
    else if (cls)  { kept = data.filter(r => r.class !== cls); deleted = data.length - kept.length; }
    else return res.status(400).json({ success:false, message:'deleteAll or class required.' });
    writeDB('students', kept);
    res.json({ success:true, deleted });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('students');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('students', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('students');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('students', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// Legacy alias kept for backward compatibility
router.post('/bulk', protect, (req,res) => {
  try {
    const incoming = req.body.students;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'students array required.' });
    const existing = readDB('students');
    const existingRolls = new Set(existing.map(r => r.rollNo));
    const added = [], skipped = [];
    incoming.forEach(s => {
      if (existingRolls.has(s.rollNo)) { skipped.push(s.rollNo); return; }
      const item = { _id:newId(), section:'A', status:'Active', ...s, createdAt:new Date().toISOString() };
      existing.push(item); added.push(item);
    });
    writeDB('students', existing);
    res.json({ success:true, added:added.length, skipped:skipped.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk/import', protect, (req,res) => {
  try {
    const incoming = req.body.students;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'students array required.' });
    const existing = readDB('students');
    const existingRolls = new Set(existing.map(r => r.rollNo));
    const added = [], skipped = [];
    incoming.forEach(s => {
      if (existingRolls.has(s.rollNo)) { skipped.push(s.rollNo); return; }
      const item = { _id:newId(), section:'A', status:'Active', ...s, createdAt:new Date().toISOString() };
      existing.push(item); added.push(item);
    });
    writeDB('students', existing);
    res.json({ success:true, added:added.length, skipped:skipped.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { deleteAll, class: cls } = req.body;
    let data = readDB('students');
    const before = data.length;
    if (deleteAll) data = [];
    else if (cls) data = data.filter(r => r.class !== cls);
    else return res.status(400).json({ success:false, message:'deleteAll or class required.' });
    writeDB('students', data);
    res.json({ success:true, deleted: before - data.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
