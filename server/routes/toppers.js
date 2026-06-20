const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs'), path = require('path');

router.get('/', (req,res) => {
  try {
    const data = readDB('toppers').sort((a,b) => (a.rank||99)-(b.rank||99));
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='toppers';next();}, upload.single('photo'), (req,res) => {
  try {
    const { name, class:cls, exam, year, percentage, position, subject, rank=99 } = req.body;
    if (!name) return res.status(400).json({ success:false, message:'Name required.' });
    const item = { _id:newId(), name, class:cls, exam, year, percentage, position, subject,
      rank:parseInt(rank), photo: req.file ? `/uploads/toppers/${req.file.filename}` : '',
      createdAt:new Date().toISOString() };
    const data = readDB('toppers'); data.push(item);
    writeDB('toppers', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res,next)=>{req.uploadDir='toppers';next();}, upload.single('photo'), (req,res) => {
  try {
    const data = readDB('toppers');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    const updated = { ...data[idx], ...req.body, rank:parseInt(req.body.rank||data[idx].rank||99),
      photo: req.file ? `/uploads/toppers/${req.file.filename}` : data[idx].photo };
    data[idx] = updated; writeDB('toppers', data);
    res.json({ success:true, data:updated });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('toppers');
    const item = data.find(r => r._id === req.params.id);
    if (!item) return res.status(404).json({ success:false, message:'Not found.' });
    if (item.photo) { const p=path.join(__dirname,'../../',item.photo); if(fs.existsSync(p)) fs.unlinkSync(p); }
    writeDB('toppers', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
