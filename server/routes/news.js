const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload  = require('../middleware/upload');

// GET /api/news
router.get('/', (req, res) => {
  const { limit = 10, page = 1, category } = req.query;
  let data = readDB('news').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (category) data = data.filter(n => n.category === category);
  const total = data.length;
  const skip  = (parseInt(page)-1) * parseInt(limit);
  data = data.slice(skip, skip + parseInt(limit));
  res.json({ success: true, data, total, page: parseInt(page) });
});

// GET /api/news/:id
router.get('/:id', (req, res) => {
  const item = readDB('news').find(n => n._id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json({ success: true, data: item });
});

// POST /api/news
router.post('/', protect, (req, res, next) => { req.uploadDir = 'news'; next(); },
  upload.single('image'), (req, res) => {
    const { title, body, category, featured } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'Title and body required.' });
    const all  = readDB('news');
    const item = {
      _id: newId(), title, body,
      category: category || 'General',
      featured: featured === 'true',
      image: req.file ? `/uploads/news/${req.file.filename}` : '',
      createdAt: new Date().toISOString()
    };
    all.push(item);
    writeDB('news', all);
    res.status(201).json({ success: true, message: 'News created.', data: item });
  }
);

// PUT /api/news/:id
router.put('/:id', protect, (req, res) => {
  const all = readDB('news');
  const idx = all.findIndex(n => n._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all[idx] = { ...all[idx], ...req.body, _id: req.params.id };
  writeDB('news', all);
  res.json({ success: true, message: 'Updated.', data: all[idx] });
});

// DELETE /api/news/:id
router.delete('/:id', protect, (req, res) => {
  let all = readDB('news');
  const idx = all.findIndex(n => n._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  all.splice(idx, 1);
  writeDB('news', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;
