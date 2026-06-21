const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs'), path = require('path');

router.get('/', (req,res) => {
  try {
    const data = readDB('teachers').filter(r => r.status !== 'Inactive');
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/all', protect, (req,res) => {
  try {
    res.json({ success:true, data: readDB('teachers') });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req,res,next)=>{req.uploadDir='teachers';next();}, upload.single('photo'), (req,res) => {
  try {
    const { name, subject } = req.body;
    if (!name||!subject) return res.status(400).json({ success:false, message:'Name and subject required.' });
    const item = { _id:newId(), status:'Active', ...req.body,
      photo: req.file ? `/uploads/teachers/${req.file.filename}` : '',
      createdAt:new Date().toISOString() };
    const data = readDB('teachers'); data.push(item); writeDB('teachers', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res,next)=>{req.uploadDir='teachers';next();}, upload.single('photo'), (req,res) => {
  try {
    const data = readDB('teachers');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    if (req.file && data[idx].photo) { require('../utils/safeFile').safeUnlink(data[idx].photo); }
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id,
      photo: req.file ? `/uploads/teachers/${req.file.filename}` : data[idx].photo };
    writeDB('teachers', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('teachers');
    const item = data.find(r => r._id === req.params.id);
    if (!item) return res.status(404).json({ success:false, message:'Not found.' });
    if (item.photo) { require('../utils/safeFile').safeUnlink(item.photo); }
    writeDB('teachers', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
