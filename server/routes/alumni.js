const express = require('express');
const router  = express.Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

router.get('/', (req,res) => {
  try {
    const { status='Approved', batch, search } = req.query;
    let data = readDB('alumni');
    if (status) data = data.filter(r => r.status === status);
    if (batch)  data = data.filter(r => r.batch === batch);
    if (search) { const q=search.toLowerCase(); data=data.filter(r=>(r.name||'').toLowerCase().includes(q)); }
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/all', protect, (req,res) => {
  try { res.json({ success:true, data: readDB('alumni') }); }
  catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/admin', protect, (req,res) => {
  try {
    const { status, batch, search } = req.query;
    let data = readDB('alumni');
    if (status) data = data.filter(r => r.status === status);
    if (batch)  data = data.filter(r => r.batch === batch);
    if (search) { const q=search.toLowerCase(); data=data.filter(r=>(r.name||'').toLowerCase().includes(q)); }
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.patch('/:id/status', protect, (req,res) => {
  try {
    const { status } = req.body;
    if (!['Approved','Rejected','Pending'].includes(status)) return res.status(400).json({ success:false, message:'Invalid status.' });
    const data = readDB('alumni');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], status };
    writeDB('alumni', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', (req,res) => {
  try {
    const { name, batch } = req.body;
    if (!name || !batch) return res.status(400).json({ success:false, message:'Name and batch required.' });
    const item = { _id:newId(), status:'Pending', public:'Yes', ...req.body, createdAt:new Date().toISOString() };
    const data = readDB('alumni'); data.push(item); writeDB('alumni', data);
    res.status(201).json({ success:true, message:'Registration submitted for review.', data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req,res) => {
  try {
    const data = readDB('alumni');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx===-1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id:req.params.id };
    writeDB('alumni', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req,res) => {
  try {
    const data = readDB('alumni');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('alumni', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
