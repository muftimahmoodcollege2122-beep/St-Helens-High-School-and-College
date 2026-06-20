const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.post('/', (req,res) => {
  try {
    const { studentName, applyingClass, fatherName } = req.body;
    if (!studentName || !applyingClass) return res.status(400).json({ success:false, message:'Student name and class required.' });
    const item = { _id:newId(), status:'Pending', ...req.body, createdAt:new Date().toISOString() };
    const data = readDB('admissions'); data.unshift(item); writeDB('admissions', data);
    res.status(201).json({ success:true, message:'Application submitted successfully.', data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/', protect, (req,res) => {
  try {
    const { status, class:cls } = req.query;
    let data = readDB('admissions');
    if (status) data = data.filter(r => r.status === status);
    if (cls)    data = data.filter(r => r.applyingClass === cls);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('admissions');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('admissions', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('admissions');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('admissions', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
