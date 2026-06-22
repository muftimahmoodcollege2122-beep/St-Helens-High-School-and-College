const router = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// GET /api/timetable?class=10&section=A
router.get('/', (req, res) => {
  try {
    const { class: cls, section } = req.query;
    let data = readDB('timetable');
    if (cls) data = data.filter(r => r.class === cls);
    if (section) data = data.filter(r => r.section === section);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// POST /api/timetable — create full timetable entry (one period)
router.post('/', protect, (req, res) => {
  try {
    const { class:cls, section, day, period, subject, teacher, startTime, endTime } = req.body;
    if (!cls || !day || !period || !subject) return res.status(400).json({ success:false, message:'class, day, period, subject required.' });
    const data = readDB('timetable');
    // Replace if same slot already exists
    const existingIdx = data.findIndex(r => r.class === cls && r.section === (section||'A') && r.day === day && r.period === period);
    const item = { _id: existingIdx !== -1 ? data[existingIdx]._id : newId(), class:cls, section:section||'A', day, period, subject, teacher:teacher||'', startTime:startTime||'', endTime:endTime||'', updatedAt: new Date().toISOString() };
    if (existingIdx !== -1) data[existingIdx] = item;
    else data.push(item);
    writeDB('timetable', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// PUT /api/timetable/:id
router.put('/:id', protect, (req, res) => {
  try {
    const data = readDB('timetable');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id: req.params.id, updatedAt: new Date().toISOString() };
    writeDB('timetable', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const data = readDB('timetable');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('timetable', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// DELETE all for a class
router.delete('/clear/:class/:section', protect, (req, res) => {
  try {
    const data = readDB('timetable');
    const kept = data.filter(r => !(r.class === req.params.class && r.section === req.params.section));
    writeDB('timetable', kept);
    res.json({ success:true, deleted: data.length - kept.length });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
