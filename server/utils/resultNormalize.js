// Converts CSV bulk-import rows with flat "SubjectName_Total"/"SubjectName_Obtained"
// columns into the subjects:[{name,totalMarks,obtainedMarks}] shape the rest of
// the app expects (manual add, portal lookup, reports). Leaves already-shaped
// rows (with a real subjects array) untouched.
function normalizeResultRow(r) {
  if (Array.isArray(r.subjects) && r.subjects.length) return r;
  const subjects = [];
  const rest = {};
  Object.keys(r).forEach(key => {
    if (key.endsWith('_Total')) {
      const name = key.slice(0, -'_Total'.length);
      const obtainedKey = name + '_Obtained';
      if (r[obtainedKey] !== undefined) {
        subjects.push({ name, totalMarks: Number(r[key])||0, obtainedMarks: Number(r[obtainedKey])||0 });
      }
    } else if (!key.endsWith('_Obtained')) {
      rest[key] = r[key];
    }
  });
  return subjects.length ? { ...rest, subjects } : r;
}

module.exports = { normalizeResultRow };
