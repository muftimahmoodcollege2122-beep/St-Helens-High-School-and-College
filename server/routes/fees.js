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

module.exports = router;
