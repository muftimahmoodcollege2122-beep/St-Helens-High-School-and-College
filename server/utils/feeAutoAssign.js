const { readDB, writeDB, newId, readSettings } = require('../db');

function classToGroup(cls) {
  if (!cls) return null;
  const c = String(cls).toLowerCase().trim();
  if (c.includes('nursery') || c.includes('kg') || c.includes('prep')) return 'Nursery-KG';
  if (c.includes('fa') || c.includes('fsc') || c.includes('f.sc') || c.includes('f.a')) return 'FA/FSc';
  const n = parseInt(c.replace(/[^0-9]/g, ''));
  if (!isNaN(n)) {
    if (n <= 0)  return 'Nursery-KG';
    if (n <= 5)  return 'Class 1-5';
    if (n <= 8)  return 'Class 6-8';
    if (n <= 10) return 'Class 9-10';
    return 'FA/FSc';
  }
  return null;
}

function autoAssignFees(student) {
  try {
    const settings = readSettings() || {};
    const structure = settings.feeStructure || {};
    const months = settings.feeMonths || ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const group = classToGroup(student.class || student.applyingClass);
    if (!group || !structure[group]) return { assigned: 0, group };

    const fees = readDB('fees');
    const plan = structure[group];
    const year = new Date().getFullYear();
    const newFees = [];

    // One-time admission fee
    newFees.push({
      _id: newId(), student: student._id, rollNo: student.rollNo || '',
      studentName: student.name || student.studentName || '',
      class: student.class || student.applyingClass || '',
      feeType: 'Admission Fee', amount: plan.admission,
      month: 'One-Time', year: String(year),
      status: 'Unpaid', group, createdAt: new Date().toISOString()
    });

    // Annual fee
    newFees.push({
      _id: newId(), student: student._id, rollNo: student.rollNo || '',
      studentName: student.name || student.studentName || '',
      class: student.class || student.applyingClass || '',
      feeType: 'Annual Fund', amount: plan.annual,
      month: 'Annual', year: String(year),
      status: 'Unpaid', group, createdAt: new Date().toISOString()
    });

    // Monthly fees for remaining months of current year
    const currentMonth = new Date().getMonth();
    months.slice(currentMonth).forEach(month => {
      newFees.push({
        _id: newId(), student: student._id, rollNo: student.rollNo || '',
        studentName: student.name || student.studentName || '',
        class: student.class || student.applyingClass || '',
        feeType: 'Monthly Fee', amount: plan.monthly,
        month, year: String(year),
        status: 'Unpaid', group, createdAt: new Date().toISOString()
      });
    });

    fees.push(...newFees);
    writeDB('fees', fees);
    return { assigned: newFees.length, group };
  } catch (e) {
    return { assigned: 0, error: e.message };
  }
}

module.exports = { autoAssignFees, classToGroup };
