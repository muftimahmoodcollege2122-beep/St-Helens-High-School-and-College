const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', (req, res) => {
  let data = readDB('events').sort((a,b) => new Date(a.date) - new Date(b.date));
  const { status, type, limit = 10, page = 1 } = req.query;
  if (status) data = data.filter(e => e.status === status);
  if (type)   data = data.filter(e => e.type   === type);
  const total = data.length;
  data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
  res.json({ success: true, data, total });
});

router.get('/:id', (req, res) => {
  const item = readDB('events').find(e => e._id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, data: item });
});

router.post('/', protect, (req, res) => {
  const { title, description, date } = req.body;
  if (!title || !description || !date) return res.status(400).json({ success: false, message: 'Title, description, date required.' });
  const all  = readDB('events');
  const item = { _id: newId(), ...req.body, createdAt: new Date().toISOString() };
  all.push(item);
  writeDB('events', all);
  res.status(201).json({ success: true, message: 'Event created.', data: item });
});

router.put('/:id', protect, (req, res) => {
  const all = readDB('events');
  const idx = all.findIndex(e => e._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all[idx] = { ...all[idx], ...req.body, _id: req.params.id };
  writeDB('events', all);
  res.json({ success: true, message: 'Updated.', data: all[idx] });
});

router.delete('/:id', protect, (req, res) => {
  let all = readDB('events');
  const idx = all.findIndex(e => e._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all.splice(idx, 1);
  writeDB('events', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;
