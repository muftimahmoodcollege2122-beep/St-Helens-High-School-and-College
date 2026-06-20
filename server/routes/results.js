const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/lookup', (req,res) => {
  try {
    const { rollNo, exam, year } = req.query;
    if (!rollNo) return res.status(400).json({ success:false, message:'rollNo required.' });
    let data = readDB('results').filter(r => r.rollNo === rollNo);
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    if (!data.length) return res.status(404).json({ success:false, message:'No result found.' });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/', (req,res) => {
  try {
    const { rollNo, exam, year, class:cls } = req.query;
    let data = readDB('results');
    if (rollNo) data = data.filter(r => r.rollNo === rollNo);
    if (exam)   data = data.filter(r => r.exam === exam);
    if (year)   data = data.filter(r => r.year === year);
    if (cls)    data = data.filter(r => r.class === cls);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res) => {
  try {
    const item = { _id:newId(), ...req.body, createdAt:new Date().toISOString() };
    const data = readDB('results'); data.push(item); writeDB('results', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { deleteAll, exam, year } = req.body;
    const data = readDB('results');
    let kept, deleted;
    if (deleteAll) { deleted = data.length; kept = []; }
    else if (exam) { kept = data.filter(r => !(r.exam === exam && (!year || r.year === year))); deleted = data.length - kept.length; }
    else return res.status(400).json({ success:false, message:'deleteAll or exam required.' });
    writeDB('results', kept);
    res.json({ success:true, deleted });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('results');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('results', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('results');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('results', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk', protect, (req,res) => {
  try {
    const incoming = req.body.rows || (Array.isArray(req.body) ? req.body : req.body.results);
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'Array required.' });
    const { exam, year, overwrite } = req.body;
    const data = readDB('results');
    let added = 0, skipped = 0;
    const errors = [];
    incoming.forEach(r => {
      const record = { ...r, exam: r.exam || exam, year: r.year || year };
      if (!record.rollNo) { errors.push(`Missing rollNo: ${JSON.stringify(r)}`); return; }
      const existingIdx = data.findIndex(d => d.rollNo === record.rollNo && d.exam === record.exam && d.year === record.year);
      if (existingIdx !== -1) {
        if (overwrite) { data[existingIdx] = { ...data[existingIdx], ...record, _id: data[existingIdx]._id }; added++; }
        else skipped++;
        return;
      }
      data.push({ _id:newId(), ...record, createdAt:new Date().toISOString() });
      added++;
    });
    writeDB('results', data);
    res.json({ success:true, added, skipped, errors });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
