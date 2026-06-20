const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', (req,res) => {
  try {
    const { limit=10, status } = req.query;
    let data = readDB('events');
    if (status) data = data.filter(r => r.status === status);
    data.sort((a,b) => new Date(a.date) - new Date(b.date));
    res.json({ success:true, data: data.slice(0, parseInt(limit)) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res) => {
  try {
    const { title, description, date, type='General', location='', status='Upcoming' } = req.body;
    if (!title || !date) return res.status(400).json({ success:false, message:'Title and date required.' });
    const item = { _id:newId(), title, description, date, type, location, status, createdAt:new Date().toISOString() };
    const data = readDB('events'); data.push(item);
    writeDB('events', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('events');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body };
    writeDB('events', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('events');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('events', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
