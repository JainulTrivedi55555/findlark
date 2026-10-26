// Profile seed/candidates.json: field types and distinct values with counts.
// Usage: node scripts/explore/profile.js
const fs = require('fs');
const path = require('path');
const cands = JSON.parse(fs.readFileSync(path.join(__dirname, '../../seed/candidates.json'), 'utf8'));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function addTypes(map, obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    map[key] = map[key] || {};
    map[key][typeOf(v)] = (map[key][typeOf(v)] || 0) + 1;
    if (v && typeof v === 'object' && !Array.isArray(v)) addTypes(map, v, key + '.');
  }
}
function count(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}
function show(title, values, limit = Infinity) {
  const c = count(values);
  console.log(`\n## ${title} (${c.length} distinct, ${values.length} total)`);
  for (const [v, n] of c.slice(0, limit)) console.log(`  ${JSON.stringify(v)}: ${n}`);
  if (c.length > limit) console.log(`  ... ${c.length - limit} more`);
}

const candTypes = {}, expTypes = {}, eduTypes = {};
for (const c of cands) {
  addTypes(candTypes, c);
  for (const e of c.experiences) addTypes(expTypes, e);
  for (const e of c.education) addTypes(eduTypes, e);
}
console.log('# Candidate field types', JSON.stringify(candTypes, null, 1));
console.log('# Experience field types', JSON.stringify(expTypes, null, 1));
console.log('# Education field types', JSON.stringify(eduTypes, null, 1));

const exps = cands.flatMap((c) => c.experiences);
const edus = cands.flatMap((c) => c.education);

show('location.city', cands.map((c) => c.location.city));
show('location city|state|country', cands.map((c) => `${c.location.city}|${c.location.state}|${c.location.country}`));
show('role', cands.map((c) => c.role));
show('seniority', cands.map((c) => c.seniority));
show('open_to_work', cands.map((c) => c.open_to_work));
show('years_experience', cands.map((c) => c.years_experience));
show('seniority x years (min-max)', []);
const sy = {};
for (const c of cands) { const s = (sy[c.seniority] ||= { min: 99, max: 0, n: 0 }); s.min = Math.min(s.min, c.years_experience); s.max = Math.max(s.max, c.years_experience); s.n++; }
console.log(sy);
show('skills', cands.flatMap((c) => c.skills));
show('skills per candidate', cands.map((c) => c.skills.length));
show('current_title', cands.map((c) => c.current_title));
show('current_company', cands.map((c) => c.current_company));
show('experience.title', exps.map((e) => e.title));
show('experience.company', exps.map((e) => e.company));
show('experience.company_type', exps.map((e) => e.company_type));
show('company -> company_type pairs', exps.map((e) => `${e.company} => ${e.company_type}`));
show('experiences per candidate', cands.map((c) => c.experiences.length));
show('experience end_year null count', exps.map((e) => (e.end_year === null ? 'current' : 'past')));
show('current exps per candidate', cands.map((c) => c.experiences.filter((e) => e.end_year === null).length));
show('education.degree', edus.map((e) => e.degree));
show('education.field', edus.map((e) => e.field));
show('education.school', edus.map((e) => e.school));
show('education per candidate', cands.map((c) => c.education.length));
show('headline separator pattern', cands.map((c) => (c.headline.includes(' · ') ? 'Title · skills' : 'other')));
show('start_year', exps.map((e) => e.start_year));
show('graduation_year', edus.map((e) => e.graduation_year), 10);
