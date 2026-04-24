const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload  = require('../middleware/upload');

router.get('/', (req, res) => {
  const { limit = 20, page = 1, category } = req.query;
  let data = readDB('gallery').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (category) data = data.filter(g => g.category === category);
  const total = data.length;
  data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
  res.json({ success: true, data, total });
});

router.post('/', protect, (req, res, next) => { req.uploadDir = 'gallery'; next(); },
  upload.single('image'), (req, res) => {
    if (!req.body.title) return res.status(400).json({ success: false, message: 'Title required.' });
    if (!req.file)       return res.status(400).json({ success: false, message: 'Image required.' });
    const all  = readDB('gallery');
    const item = {
      _id: newId(), title: req.body.title,
      description: req.body.description || '',
      imageUrl: `/uploads/gallery/${req.file.filename}`,
      category: req.body.category || 'Other',
      featured: req.body.featured === 'true',
      createdAt: new Date().toISOString()
    };
    all.push(item);
    writeDB('gallery', all);
    res.status(201).json({ success: true, message: 'Image uploaded.', data: item });
  }
);

router.delete('/:id', protect, (req, res) => {
  let all = readDB('gallery');
  const idx = all.findIndex(g => g._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found.' });
  const item = all[idx];
  // delete file
  if (item.imageUrl && !item.imageUrl.startsWith('/images/')) {
    const fp = path.join(__dirname, '../../', item.imageUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  all.splice(idx, 1);
  writeDB('gallery', all);
  res.json({ success: true, message: 'Deleted.' });
});

module.exports = router;
