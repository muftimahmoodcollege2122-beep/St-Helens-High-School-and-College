const router = require('express').Router();
const { readDB, writeDB, newId } = require('../db');
const { protect } = require('../middleware/auth');
const { sendWhatsApp } = require('../utils/whatsapp');

// GET /api/exams?class=10&exam=Annual
router.get('/', (req, res) => {
  try {
    const { class:cls, exam, year } = req.query;
    let data = readDB('examSchedule');
    if (cls)  data = data.filter(r => !r.class || r.class === cls);
    if (exam) data = data.filter(r => r.exam === exam);
    if (year) data = data.filter(r => r.year === year);
    data.sort((a,b) => (a.date > b.date ? 1 : -1));
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.post('/', protect, (req, res) => {
  try {
    const { exam, year, class:cls, subject, date, startTime, endTime, venue, notes } = req.body;
    if (!exam || !subject || !date) return res.status(400).json({ success:false, message:'exam, subject, date required.' });
    const item = { _id:newId(), exam, year:year||new Date().getFullYear().toString(), class:cls||'', subject, date, startTime:startTime||'', endTime:endTime||'', venue:venue||'', notes:notes||'', createdAt: new Date().toISOString() };
    const data = readDB('examSchedule');
    data.push(item);
    writeDB('examSchedule', data);
    res.status(201).json({ success:true, data:item });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.put('/:id', protect, (req, res) => {
  try {
    const data = readDB('examSchedule');
    const idx = data.findIndex(r => r._id === req.params.id);
    if (idx === -1) return res.status(404).json({ success:false, message:'Not found.' });
    data[idx] = { ...data[idx], ...req.body, _id: req.params.id };
    writeDB('examSchedule', data);
    res.json({ success:true, data:data[idx] });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.delete('/:id', protect, (req, res) => {
  try {
    const data = readDB('examSchedule');
    if (!data.find(r => r._id === req.params.id)) return res.status(404).json({ success:false, message:'Not found.' });
    writeDB('examSchedule', data.filter(r => r._id !== req.params.id));
    res.json({ success:true, message:'Deleted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// POST /api/exams/notify — sends WA message to all parents about upcoming exam schedule
router.post('/notify', protect, async (req, res) => {
  try {
    const { exam, year, class:cls } = req.body;
    if (!exam) return res.status(400).json({ success:false, message:'exam required.' });
    let schedule = readDB('examSchedule').filter(r => r.exam === exam && (!year || r.year === year) && (!cls || !r.class || r.class === cls));
    schedule.sort((a,b) => (a.date > b.date ? 1 : -1));
    if (!schedule.length) return res.status(400).json({ success:false, message:'No exam schedule found.' });
    const lines = schedule.map(s => `📖 ${s.subject}: ${s.date}${s.startTime ? ' '+s.startTime : ''}${s.venue ? ' @ '+s.venue : ''}`).join('\n');
    const msg = `📅 *${exam} Exam Schedule${year?' '+year:''}*${cls?' — Class '+cls:''}:\n\n${lines}\n\n— St. Helen's High School & College`;
    const students = readDB('students').filter(s => !cls || s.class === cls);
    const phones = [...new Set(students.map(s => s.fatherPhone).filter(Boolean))];
    let sent = 0;
    for (const phone of phones) { await sendWhatsApp(phone, msg); sent++; }
    res.json({ success:true, message:`Schedule sent to ${sent} parent(s).`, sent });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
