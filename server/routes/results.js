const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

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
    const incoming = Array.isArray(req.body) ? req.body : req.body.results;
    if (!Array.isArray(incoming)) return res.status(400).json({ success:false, message:'Array required.' });
    const data = readDB('results');
    const added = incoming.map(r => { const item={_id:newId(),...r,createdAt:new Date().toISOString()}; data.push(item); return item; });
    writeDB('results', data);
    res.json({ success:true, added:added.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/bulk/delete', protect, (req,res) => {
  try {
    const { deleteAll, exam, year } = req.body;
    let data = readDB('results');
    const before = data.length;
    if (deleteAll) data = [];
    else if (exam) data = data.filter(r => !(r.exam === exam && (!year || r.year === year)));
    else return res.status(400).json({ success:false, message:'deleteAll or exam required.' });
    writeDB('results', data);
    res.json({ success:true, deleted: before - data.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
