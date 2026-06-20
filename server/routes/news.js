const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs'), path = require('path');

router.get('/', (req, res) => {
  try {
    const { limit=10, page=1, category } = req.query;
    let data = readDB('news');
    if (category) data = data.filter(r => r.category === category);
    data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = data.length;
    data = data.slice((parseInt(page)-1)*parseInt(limit), parseInt(page)*parseInt(limit));
    res.json({ success:true, data, total, page:parseInt(page) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const item = readDB('news').find(r => r._id === req.params.id);
    if (!item) return res.status(404).json({ success:false, message:'Not found.' });
    res.json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='news';next();}, upload.single('image'), (req,res) => {
  try {
    const { title, body, category='General', featured=false } = req.body;
    if (!title || !body) return res.status(400).json({ success:false, message:'Title and body required.' });
    const item = { _id:newId(), title, body, category, featured:featured==='true'||featured===true,
      imageUrl: req.file ? `/uploads/news/${req.file.filename}` : (req.body.imageUrl||''),
      createdAt: new Date().toISOString() };
    const data = readDB('news');
    data.unshift(item);
    writeDB('news', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res,next)=>{req.uploadDir='news';next();}, upload.single('image'), (req,res) => {
  try {
    const data = readDB('news');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    const updated = { ...data[idx], ...req.body,
      featured: req.body.featured==='true'||req.body.featured===true,
      imageUrl: req.file ? `/uploads/news/${req.file.filename}` : data[idx].imageUrl };
    data[idx] = updated;
    writeDB('news', data);
    res.json({ success:true, data:updated });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('news');
    const item = data.find(r => r._id === req.params.id);
    if (!item) return res.status(404).json({ success:false, message:'Not found.' });
    if (item.imageUrl) { const p=path.join(__dirname,'../../',item.imageUrl); if(fs.existsSync(p)) fs.unlinkSync(p); }
    writeDB('news', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
