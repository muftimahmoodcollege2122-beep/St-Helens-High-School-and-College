const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.post('/', (req,res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !message) return res.status(400).json({ success:false, message:'Name and message required.' });
    const item = { _id:newId(), name, email, phone, subject, message, status:'unread', createdAt:new Date().toISOString() };
    const data = readDB('contact'); data.unshift(item);
    writeDB('contact', data);
    res.status(201).json({ success:true, message:'Message received. We will contact you soon.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/', protect, (req,res) => {
  try {
    res.json({ success:true, data: readDB('contact') });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('contact');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body };
    writeDB('contact', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('contact');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('contact', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
