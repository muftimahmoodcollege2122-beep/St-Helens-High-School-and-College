const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId, attOps } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', protect, (req,res) => {
  try {
    const { date, class:cls, section } = req.query;
    const data = attOps.query({ date, cls, section });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/bulk', protect, (req,res) => {
  try {
    const { date, class:cls, section, records } = req.body;
    if (!date||!cls||!Array.isArray(records)) return res.status(400).json({ success:false, message:'date, class and records required.' });
    const stamped = records.map(r => ({ _id:r._id||newId(), ...r, date, class:cls, section:section||'A', createdAt:r.createdAt||new Date().toISOString() }));
    attOps.replaceBulk(date, cls, section||'A', stamped);
    res.json({ success:true, message:'Attendance saved.', count:stamped.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/summary/:date', protect, (req,res) => {
  try { res.json({ success:true, data: attOps.summary(req.params.date) }); }
  catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/student/:rollNo', (req,res) => {
  try {
    const { month } = req.query;
    const data = attOps.studentHistory(req.params.rollNo, month);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const updated = attOps.updateRecord(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success:false, message:'Not found.' });
    res.json({ success:true, data:updated });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/year/:year', protect, (req,res) => {
  try {
    const count = attOps.deleteYear(req.params.year);
    res.json({ success:true, message:`Deleted ${count} records for ${req.params.year}.` });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/students', protect, (req,res) => {
  try {
    const { class:cls, section } = req.query;
    let data = readDB('students').filter(s => s.status === 'Active' || !s.status);
    if (cls)     data = data.filter(s => s.class === cls);
    if (section) data = data.filter(s => s.section === section);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/years', protect, (req,res) => {
  try { res.json({ success:true, data: attOps.years() }); }
  catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
