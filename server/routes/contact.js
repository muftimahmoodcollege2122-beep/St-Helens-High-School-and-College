const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.post('/', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message)
    return res.status(400).json({ success: false, message: 'name, email, subject, message required.' });
  const all  = readDB('contact');
  const item = { _id: newId(), name, email, phone: req.body.phone||'', subject, message, status:'unread', createdAt: new Date().toISOString() };
  all.push(item);
  writeDB('contact', all);
  res.status(201).json({ success: true, message: 'Message sent! We will get back to you soon.' });
});

router.get('/', protect, (req, res) => {
  const data = readDB('contact').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({ success: true, data, total: data.length });
});

router.put('/:id', protect, (req, res) => {
  const all = readDB('contact');
  const idx = all.findIndex(c => c._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all[idx] = { ...all[idx], ...req.body, _id: req.params.id };
  writeDB('contact', all);
  res.json({ success: true, message: 'Updated.', data: all[idx] });
});

router.delete('/:id', protect, (req, res) => {
  let all = readDB('contact');
  const idx = all.findIndex(c => c._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all.splice(idx, 1);
  writeDB('contact', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;
