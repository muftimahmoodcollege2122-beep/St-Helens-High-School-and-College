const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload  = require('../middleware/upload');

// PUBLIC: get all toppers
router.get('/', (req, res) => {
  const data = readDB('toppers').sort((a,b) => (a.rank||99) - (b.rank||99));
  res.json({ success: true, data });
});

// ADMIN: add topper
router.post('/', protect, (req, res, next) => { req.uploadDir = 'toppers'; next(); },
  upload.single('photo'), (req, res) => {
    const { name, class: cls, exam, year, percentage, position, subject } = req.body;
    if (!name || !cls || !exam) return res.status(400).json({ success: false, message: 'name, class, exam required.' });
    const all  = readDB('toppers');
    const item = { _id: newId(), name, class: cls, exam, year: year||'', percentage: percentage||'', position: position||'', subject: subject||'', rank: all.length+1, createdAt: new Date().toISOString() };
    if (req.file) item.photo = `/uploads/toppers/${req.file.filename}`;
    all.push(item);
    writeDB('toppers', all);
    res.status(201).json({ success: true, data: item });
  }
);

// ADMIN: delete topper
router.delete('/:id', protect, (req, res) => {
  let all = readDB('toppers');
  const idx = all.findIndex(t => t._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all.splice(idx, 1);
  writeDB('toppers', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;
