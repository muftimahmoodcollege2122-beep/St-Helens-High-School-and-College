require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/images',  express.static(path.join(__dirname, 'public', 'images')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./server/routes/auth'));
app.use('/api/students',      require('./server/routes/students'));
app.use('/api/teachers',      require('./server/routes/teachers'));
app.use('/api/attendance',    require('./server/routes/attendance'));
app.use('/api/fees',          require('./server/routes/fees'));
app.use('/api/results',       require('./server/routes/results'));
app.use('/api/news',          require('./server/routes/news'));
app.use('/api/events',        require('./server/routes/events'));
app.use('/api/gallery',       require('./server/routes/gallery'));
app.use('/api/toppers',       require('./server/routes/toppers'));
app.use('/api/contact',       require('./server/routes/contact'));
app.use('/api/settings',      require('./server/routes/settings'));
app.use('/api/teacher-auth',  require('./server/routes/teacher-auth'));
app.use('/api/teacher-panel', require('./server/routes/teacher-panel'));
app.use('/api/parent',        require('./server/routes/parent-portal'));
app.use('/api/admissions',   require('./server/routes/admissions'));

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/portal',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));
app.get('/parent',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'parent.html')));

// ── Fallback → index.html (SPA) ───────────────────────────────────────────────
app.get('*', (req, res) => {
  const ext = path.extname(req.path).toLowerCase().replace('.', '');
  const staticExts = ['jpg','jpeg','png','webp','gif','svg','ico','css','js','woff','woff2','ttf'];
  if (staticExts.includes(ext)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n🏫  Mufti Mehmood College – MMPC, D.I. Khan');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐  Website        →  http://localhost:${PORT}`);
  console.log(`🔐  Admin Panel    →  http://localhost:${PORT}/admin`);
  console.log(`👨‍🏫  Teacher Panel  →  http://localhost:${PORT}/teacher`);
  console.log(`🎓  Student Portal →  http://localhost:${PORT}/portal`);
  console.log(`👨‍👩‍👦  Parent Portal  →  http://localhost:${PORT}/parent`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Run: node server/setup-passwords.js  (first time only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
