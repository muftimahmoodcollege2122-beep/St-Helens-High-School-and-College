// ── St. Helens Seed Script ──────────────────────────────────────────────────────────
// Creates admin user + sample data in server/db/schools/shhs/
// Run once: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { readDB, writeDB, writeSettings, readSettings, newId, attOps } = require('./db');

async function seed() {
  console.log('\n🌱  Seeding St. Helen\'s database...\n');

  // ── Admin user ──────────────────────────────────────────────────────────────
  const users = readDB('users');
  if (!users.find(u => u.username === 'admin')) {
    const hash = await bcrypt.hash('admin123', 12);
    users.push({
      _id: newId(), username: 'admin', password: hash,
      name: 'Administrator', role: 'admin', createdAt: new Date().toISOString()
    });
    writeDB('users', users);
    console.log('✅ Admin user created — username: admin / password: admin123');
    console.log('⚠️  Change the password after first login (or run: npm run setup)');
  } else {
    console.log('ℹ️  Admin already exists');
  }

  // ── Teacher account ─────────────────────────────────────────────────────────
  const ta = readDB('teacher-accounts');
  if (!ta.find(t => t.username === 'teacher1')) {
    const hash = await bcrypt.hash('teacher123', 10);
    ta.push({
      _id: newId(), username: 'teacher1', password: hash,
      name: 'Mr. Muhammad Arif', assignedClass: '10 (Matric)', assignedSection: 'A',
      createdAt: new Date().toISOString()
    });
    writeDB('teacher-accounts', ta);
    console.log('✅ Teacher account created — username: teacher1 / password: teacher123');
  } else {
    console.log('ℹ️  Teacher account already exists');
  }

  // ── News ────────────────────────────────────────────────────────────────────
  if (readDB('news').length === 0) {
    writeDB('news', [
      { _id: newId(), title: 'Admissions Open 2025–26', body: 'Admissions are now open for all classes. Apply before the deadline.', category: 'Admission', featured: true, createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Annual Examination Schedule', body: 'Annual examinations will begin from March 15. Students are advised to prepare accordingly.', category: 'Exam', featured: false, createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Science Fair Winners', body: 'Congratulations to all students who participated in the annual science fair.', category: 'Academic', featured: false, createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample news created');
  }

  // ── Events ──────────────────────────────────────────────────────────────────
  if (readDB('events').length === 0) {
    writeDB('events', [
      { _id: newId(), title: 'Annual Sports Day', description: 'Annual sports day with various athletic competitions.', date: '2025-03-20', type: 'Sports', status: 'Upcoming', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Parent Teacher Meeting', description: 'Quarterly PTM for all classes.', date: '2025-02-28', type: 'Meeting', status: 'Upcoming', createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample events created');
  }

  // ── Teachers ────────────────────────────────────────────────────────────────
  if (readDB('teachers').length === 0) {
    writeDB('teachers', [
      { _id: newId(), name: 'Mr. Muhammad Arif',  subject: 'Mathematics',    qualification: 'MSc Mathematics', designation: 'Senior Teacher', experience: '15 years', status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Ms. Nadia Hussain',  subject: 'English',        qualification: 'MA English',      designation: 'Teacher',        experience: '8 years',  status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Mr. Tariq Mehmood',  subject: 'Physics',        qualification: 'MSc Physics',     designation: 'Senior Teacher', experience: '12 years', status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Ms. Amna Riaz',      subject: 'Pakistan Studies',qualification: 'MA History',     designation: 'Teacher',        experience: '9 years',  status: 'Active', createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample teachers created');
  }

  // ── Gallery ─────────────────────────────────────────────────────────────────
  if (readDB('gallery').length === 0) {
    writeDB('gallery', [
      { _id: newId(), title: 'St. Helen&#39;s High School &amp; College – Main Building', imageUrl: '/images/campus8.png',  category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'College Entrance & Administration',      imageUrl: '/images/campus2.webp', category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Boys Senior Block',                      imageUrl: '/images/campus1.webp', category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'College Hall',                           imageUrl: '/images/campus6.webp', category: 'Events', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Campus Garden Area',                     imageUrl: '/images/campus3.webp', category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Arch Classrooms Block',                  imageUrl: '/images/campus4.webp', category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Art & Activity Block',                   imageUrl: '/images/campus5.webp', category: 'Campus', createdAt: new Date().toISOString() },
      { _id: newId(), title: 'Inauguration Stone – ',              imageUrl: '/images/campus7.webp', category: 'Campus', createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Campus gallery seeded');
  }

  // ── Students ────────────────────────────────────────────────────────────────
  if (readDB('students').length === 0) {
    writeDB('students', [
      { _id: newId(), rollNo: '1001', name: 'Ahmed Raza Khan', fatherName: 'Muhammad Raza',  fatherPhone: '03001234567', class: '10 (Matric)', section: 'A', gender: 'Male',   status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1002', name: 'Sara Bibi',       fatherName: 'Abdul Rehman',   fatherPhone: '03009876543', class: '10 (Matric)', section: 'A', gender: 'Female', status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1003', name: 'Usman Tariq',     fatherName: 'Tariq Mehmood',  fatherPhone: '03011112222', class: '9',           section: 'B', gender: 'Male',   status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1004', name: 'Fatima Noor',     fatherName: 'Noor ul Haq',    fatherPhone: '03023334444', class: '9',           section: 'A', gender: 'Female', status: 'Active', createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1005', name: 'Hamza Iqbal',     fatherName: 'Muhammad Iqbal', fatherPhone: '03035556666', class: '8',           section: 'A', gender: 'Male',   status: 'Active', createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample students created');
  }

  // ── Results ─────────────────────────────────────────────────────────────────
  if (readDB('results').length === 0) {
    writeDB('results', [
      { _id: newId(), rollNo: '1001', studentName: 'Ahmed Raza Khan', class: '10 (Matric)', section: 'A', exam: 'Annual 2025', year: '2025', remarks: 'Excellent performance!',
        subjects: [{ name: 'Urdu', totalMarks: 100, obtainedMarks: 88 },{ name: 'English', totalMarks: 100, obtainedMarks: 82 },{ name: 'Mathematics', totalMarks: 100, obtainedMarks: 91 },{ name: 'Physics', totalMarks: 100, obtainedMarks: 85 },{ name: 'Chemistry', totalMarks: 100, obtainedMarks: 78 },{ name: 'Islamiyat', totalMarks: 50, obtainedMarks: 44 },{ name: 'Pak Studies', totalMarks: 50, obtainedMarks: 41 }], createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1002', studentName: 'Sara Bibi', class: '10 (Matric)', section: 'A', exam: 'Annual 2025', year: '2025', remarks: 'Good work.',
        subjects: [{ name: 'Urdu', totalMarks: 100, obtainedMarks: 79 },{ name: 'English', totalMarks: 100, obtainedMarks: 85 },{ name: 'Mathematics', totalMarks: 100, obtainedMarks: 61 },{ name: 'Physics', totalMarks: 100, obtainedMarks: 70 },{ name: 'Chemistry', totalMarks: 100, obtainedMarks: 68 },{ name: 'Islamiyat', totalMarks: 50, obtainedMarks: 43 },{ name: 'Pak Studies', totalMarks: 50, obtainedMarks: 38 }], createdAt: new Date().toISOString() },
      { _id: newId(), rollNo: '1003', studentName: 'Usman Tariq', class: '9', section: 'B', exam: 'Annual 2025', year: '2025', remarks: 'Needs improvement in Science.',
        subjects: [{ name: 'Urdu', totalMarks: 100, obtainedMarks: 65 },{ name: 'English', totalMarks: 100, obtainedMarks: 58 },{ name: 'Mathematics', totalMarks: 100, obtainedMarks: 72 },{ name: 'Biology', totalMarks: 100, obtainedMarks: 54 },{ name: 'Islamiyat', totalMarks: 50, obtainedMarks: 35 },{ name: 'Pak Studies', totalMarks: 50, obtainedMarks: 32 }], createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample results created  (test roll nos: 1001, 1002, 1003)');
  }

  // ── Toppers ─────────────────────────────────────────────────────────────────
  if (readDB('toppers').length === 0) {
    writeDB('toppers', [
      { _id: newId(), name: 'Ahmed Raza Khan', class: '10 (Matric)', exam: 'Annual 2025', year: '2025', percentage: '91.4%', position: '1st Position', subject: 'Science Group', rank: 1, createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Fatima Noor',     class: '10 (Matric)', exam: 'Annual 2025', year: '2025', percentage: '89.2%', position: '2nd Position', subject: 'Science Group', rank: 2, createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Sara Bibi',       class: '10 (Matric)', exam: 'Annual 2025', year: '2025', percentage: '87.6%', position: '3rd Position', subject: 'Arts Group',    rank: 3, createdAt: new Date().toISOString() },
      { _id: newId(), name: 'Usman Tariq',     class: '9',           exam: 'Annual 2025', year: '2025', percentage: '85.0%', position: '1st Position', subject: 'Science Group', rank: 4, createdAt: new Date().toISOString() },
    ]);
    console.log('✅ Sample toppers created');
  }

  // ── Empty collections (ensure tables have rows initialized if needed) ───────
  const empties = ['fees', 'homework', 'contact'];
  empties.forEach(name => {
    if (readDB(name).length === 0) writeDB(name, []);
  });
  // attendance lives in its own indexed SQLite table — nothing to initialize,
  // attOps handles it directly and an empty table is already the default state.

  // ── Default site settings ────────────────────────────────────────────────────
  if (!readSettings()) {
    writeSettings({
      heroTagline:   '⭐ St. Helen&#39;s High School &amp; College',
      heroTitle:     'St. Helen&#39;s High School &amp; College',
      heroSubtitle:  'Pakistan',
      heroMotto:     '"Knowledge is the Light that Illuminates the Path"',
      statStudents:  '2000+', statFaculty: '80+', statYears: '40+', statPassRate: '95%', statPrograms: '15+',
      aboutPara1:    'St. Helen&#39;s High School &amp; College, committed to excellence in education.',
      aboutPara2:    'We offer a comprehensive curriculum from Nursery to FA/FSc.',
      aboutMission:  'Provide quality education blending modern knowledge with Islamic values.',
      aboutVision:   'To become the leading school in the region producing well-rounded graduates.',
      aboutAcademics:'Matric, FSc, FA programmes with science & arts streams.',
      aboutCoCurr:   'Sports, debate, science fair, cultural events & more.',
      contactPhone1: '+92-xxx-xxxxxxx', contactPhone2: '+92-xxx-xxxxxxx',
      contactEmail1: 'info@sthelens.edu.pk', contactEmail2: 'admissions@sthelens.edu.pk',
      contactAddress:'Pakistan',
      contactHours:  'Mon–Sat: 7:30 AM – 2:30 PM',
      noticeActive:  false, noticeText: '', noticeType: 'info',
      admissionsOpen:true, admissionsText: 'Admissions Open for 2025–26 Session',
      whatsappEnabled: false, whatsappNumber: '', whatsappMessage: 'Assalamu Alaikum! I would like to get information about St. Helen&#39;s High School &amp; College.'
    });
    console.log('✅ Default site settings created');
  }

  console.log('\n🎉 Seeding complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Run: npm run setup  to set strong passwords');
  console.log('  Result test roll nos: 1001, 1002, 1003');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch(console.error);
