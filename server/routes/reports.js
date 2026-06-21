const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { readDB } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'sthelens-shhs-fallback-secret-key-change-in-production';

// Reports open in a new browser tab (window.open) for printing, so we can't
// attach an Authorization header — accept the token via ?token= query param too.
function protectViaQueryOrHeader(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;
    if (!token) return res.status(401).send('Access denied. No token provided.');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).send('Invalid or expired token.');
  }
}
const protect = protectViaQueryOrHeader;

function page(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;padding:30px;}
    h1{font-size:20px;border-bottom:3px solid #8b1a1a;padding-bottom:8px;margin-bottom:4px}
    .sub{color:#666;font-size:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#8b1a1a;color:#fff}
    tr:nth-child(even){background:#f7f7f7}
    @media print{ body{padding:10px} }
  </style></head><body>
  <h1>St. Helen's High School &amp; College</h1>
  <div class="sub">${title} — Generated ${new Date().toLocaleString()}</div>
  ${bodyHtml}
  <script>window.onload = () => window.print();</script>
  </body></html>`;
}

router.get('/students', protect, (req,res) => {
  const { class: cls, section } = req.query;
  let data = readDB('students');
  if (cls)     data = data.filter(s => s.class === cls);
  if (section) data = data.filter(s => s.section === section);
  const rows = data.map(s => `<tr><td>${s.rollNo||''}</td><td>${s.name||''}</td><td>${s.fatherName||''}</td><td>${s.class||''}</td><td>${s.section||''}</td><td>${s.gender||''}</td><td>${s.fatherPhone||''}</td><td>${s.status||''}</td></tr>`).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Father Name</th><th>Class</th><th>Section</th><th>Gender</th><th>Phone</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Student Record', html));
});

router.get('/fees', protect, (req,res) => {
  const { month, status } = req.query;
  let data = readDB('fees');
  if (month)  data = data.filter(f => f.month === month);
  if (status) data = data.filter(f => f.status === status);
  const students = readDB('students');
  const rows = data.map(f => {
    const s = students.find(x => x._id === f.student || x.rollNo === f.student);
    return `<tr><td>${s?s.rollNo:''}</td><td>${s?s.name:(f.student||'')}</td><td>${f.month||''}</td><td>${f.amount||''}</td><td>${f.status||''}</td></tr>`;
  }).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Month</th><th>Amount</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Fee Record', html));
});

router.get('/results', protect, (req,res) => {
  const { exam, year, class: cls } = req.query;
  let data = readDB('results');
  if (exam) data = data.filter(r => r.exam === exam);
  if (year) data = data.filter(r => r.year === year);
  if (cls)  data = data.filter(r => r.class === cls);
  const rows = data.map(r => {
    const total = (r.subjects||[]).reduce((s,x)=>s+(+x.totalMarks||0),0);
    const obtained = (r.subjects||[]).reduce((s,x)=>s+(+x.obtainedMarks||0),0);
    const pct = total ? ((obtained/total)*100).toFixed(1)+'%' : '';
    return `<tr><td>${r.rollNo||''}</td><td>${r.studentName||''}</td><td>${r.class||''}</td><td>${r.exam||''}</td><td>${obtained}/${total}</td><td>${pct}</td><td>${r.remarks||''}</td></tr>`;
  }).join('');
  const html = `<table><tr><th>Roll No</th><th>Name</th><th>Class</th><th>Exam</th><th>Marks</th><th>%</th><th>Remarks</th></tr>${rows}</table>`;
  res.send(page('Result Record', html));
});

router.get('/attendance', protect, (req,res) => {
  const { attOps } = require('../db');
  const { date, class: cls, section } = req.query;
  const data = attOps.query({ date, cls, section });
  const rows = data.map(a => `<tr><td>${a.date||''}</td><td>${a.rollNo||''}</td><td>${a.class||''}</td><td>${a.section||''}</td><td>${a.status||''}</td></tr>`).join('');
  const html = `<table><tr><th>Date</th><th>Roll No</th><th>Class</th><th>Section</th><th>Status</th></tr>${rows}</table>`;
  res.send(page('Attendance Record', html));
});

module.exports = router;
