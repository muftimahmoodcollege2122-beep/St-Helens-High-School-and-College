// ── Site Settings ─────────────────────────────────────────────────────────────
const express    = require('express');
const router     = express.Router();
const { readSettings, writeSettings } = require('../db');
const { protect } = require('../middleware/auth');

const DEFAULTS = {
  heroTagline:    '⭐ Established 2006 — D.I. Khan',
  heroTitle:      'Mufti Mahmood Public School & College',
  heroSubtitle:   'Dera Ismail Khan, Khyber Pakhtunkhwa, Pakistan',
  heroMotto:      '"Knowledge is the Light that Illuminates the Path"',
  statStudents:   '2000+', statFaculty: '80+', statYears: '40+', statPassRate: '95%', statPrograms: '15+',
  aboutPara1:     'Mufti Mahmood Public School & College, established in 2006 in Dera Ismail Khan, is one of the leading educational institutions in KPK.',
  aboutPara2:     'We offer a comprehensive curriculum from Nursery to FA/FSc, with a dedicated faculty of over 80 qualified teachers.',
  aboutMission:   'Provide quality education blending modern knowledge with Islamic values.',
  aboutVision:    'To become the leading school in KPK producing well-rounded graduates.',
  aboutAcademics: 'Matric, FSc, FA programmes with science & arts streams.',
  aboutCoCurr:    'Sports, debate, science fair, cultural events & more.',
  contactPhone1:  '+92-966-123456', contactPhone2: '+92-300-9876543',
  contactEmail1:  'info@mmpc.edu.pk', contactEmail2: 'admissions@mmpc.edu.pk',
  contactAddress: 'Kacheri Road, Dera Ismail Khan, KPK, Pakistan',
  contactHours:   'Mon-Sat: 7:30 AM - 2:30 PM',
  noticeActive:   false, noticeText: '', noticeType: 'info',
  admissionsOpen: true, admissionsText: 'Admissions Open for 2026-27 Session',
  whatsappNumber: '', whatsappMessage: 'Assalamu Alaikum! I would like to get information about MMPC.', whatsappEnabled: false,
  principalName:        'Prof. Muhammad Khalid', principalDesignation: 'Principal',
  principalMessage:     'Welcome to Mufti Mahmood Public School & College.',
  principalPhoto:       '', principalEnabled: true,
  secretaryName:        'Mr. Muhammad Khalid', secretaryDesignation: 'Province education secretary',
  secretaryMessage:     'We are committed to raising the standard of education across D.I. Khan.',
  secretaryPhoto:       '', secretaryEnabled: true,
  whyEnabled: true,
  why1Icon: '🏆', why1Title: 'Academic Excellence', why1Text: 'Consistent top results in Board exams with 95%+ pass rate every year.',
  why2Icon: '👨‍🏫', why2Title: 'Qualified Faculty',   why2Text: '80+ highly qualified and experienced teachers dedicated to student success.',
  why3Icon: '🕌', why3Title: 'Islamic Values',       why3Text: 'Education blending modern knowledge with strong Islamic moral foundation.',
  why4Icon: '🔬', why4Title: 'Modern Facilities',    why4Text: 'Well-equipped labs, library, and sports facilities for holistic development.',
  why5Icon: '🎯', why5Title: 'Career Guidance',      why5Text: 'Professional counseling to help students choose the right career path.',
  why6Icon: '🤝', why6Title: 'Parent Involvement',   why6Text: 'Regular PTMs and open communication between school and families.',
  toppersEnabled: true, toppersTitle: 'Our Top Achievers',
  tickerEnabled: false, tickerText: '',
  achievementsEnabled: true,
  ach1: '🏆 Board Position – 2024 Annual Exams',   ach2: '🥇 District Science Fair Champions 2024',
  ach3: '📚 100% Result in FA/FSc 2023',            ach4: '🎖 Best School Award – D.I. Khan 2023',
};

// GET /api/settings  (public — needed by index.html)
router.get('/', (req, res) => {
  try {
    const saved = readSettings() || {};
    res.json({ success: true, data: { ...DEFAULTS, ...saved } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/settings  (admin only)
router.put('/', protect, (req, res) => {
  try {
    const current = readSettings() || { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach(k => {
      if (req.body[k] !== undefined) current[k] = req.body[k];
    });
    writeSettings(current);
    res.json({ success: true, data: current });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/settings/upload-photo — upload principal or secretary photo
const upload = require('../middleware/upload');
router.post('/upload-photo', protect, (req, res, next) => { req.uploadDir = 'staff'; next(); },
  upload.single('photo'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
      const url = '/uploads/staff/' + req.file.filename;
      // Save to settings
      const current = readSettings() || {};
      const field = req.body.field; // 'principalPhoto' or 'secretaryPhoto'
      if (field === 'principalPhoto' || field === 'secretaryPhoto') {
        current[field] = url;
        writeSettings(current);
      }
      res.json({ success: true, url });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
  }
);

module.exports = router;
