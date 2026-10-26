// Check that derived fields agree with each other, and look for hidden data in free text.
// Usage: node scripts/explore/consistency.js
const fs = require('fs');
const path = require('path');
const cands = JSON.parse(fs.readFileSync(path.join(__dirname, '../../seed/candidates.json'), 'utf8'));

const prefix = { junior: 'Junior ', mid: '', senior: 'Senior ', staff: 'Staff ' };
const problems = {};
const bad = (k, id) => { (problems[k] ||= []).push(id); };

for (const c of cands) {
  const cur = c.experiences.filter((e) => e.end_year === null);
  if (cur.length !== 1) bad('not exactly one current exp', c.id);
  if (c.experiences[0].end_year !== null) bad('first exp is not the current one', c.id);
  if (cur[0].title !== c.current_title) bad('current_title != current exp title', c.id);
  if (cur[0].company !== c.current_company) bad('current_company != current exp company', c.id);
  if (cur[0].company_logo_url !== c.current_company_logo_url) bad('logo mismatch', c.id);
  if (c.current_title !== prefix[c.seniority] + c.role) bad('current_title != seniority prefix + role', c.id);
  if (!c.headline.startsWith(c.current_title + ' · ')) bad('headline does not start with title', c.id);
  const headSkills = c.headline.split(' · ')[1].split(', ');
  if (!headSkills.every((s) => c.skills.includes(s))) bad('headline skill not in skills', c.id);
  if (new Set(c.skills).size !== c.skills.length) bad('duplicate skills', c.id);
  // Past roles: is the role family the same across a career?
  const roleOf = (t) => t.replace(/^(Junior|Senior|Staff) /, '');
  if (!c.experiences.every((e) => roleOf(e.title) === c.role)) bad('career changed role family', c.id);
  // years vs career span
  const firstStart = Math.min(...c.experiences.map((e) => e.start_year));
  const span = 2026 - firstStart;
  if (span !== c.years_experience) bad(`years_experience != 2026 - first start_year`, c.id);
  for (const e of c.experiences) {
    if (!e.description.startsWith(`${e.title} at ${e.company}`)) bad('description pattern differs', c.id);
    if (e.end_year !== null && e.end_year < e.start_year) bad('end before start', c.id);
  }
  // whitespace / case oddities
  for (const s of [c.location.city, c.role, ...c.skills, c.education[0].school]) {
    if (s !== s.trim() || /\s{2,}/.test(s)) bad('whitespace oddity', c.id);
  }
}
for (const [k, ids] of Object.entries(problems)) console.log(`${k}: ${ids.length} (e.g. ${ids.slice(0, 5).join(', ')})`);
if (!Object.keys(problems).length) console.log('no problems');

// Free-text: do descriptions say anything beyond "<title> at <company>, working mostly with X and Y."?
const pat = /^(.+) at (.+), working mostly with (.+) and (.+)\.$/;
let off = 0;
for (const c of cands) for (const e of c.experiences) if (!pat.test(e.description)) { if (off++ < 5) console.log('odd description:', c.id, e.description); }
console.log('descriptions not matching template:', off);

// Words that might hide unsupported data
const all = JSON.stringify(cands).toLowerCase();
for (const w of ['japanese', 'language', 'speak', 'remote', 'visa', 'salary', 'fluent', 'spanish', 'enterprise sales', 'b2b', 'fintech']) {
  console.log(`"${w}" occurrences:`, all.split(w).length - 1);
}
// Description skills: are they from the candidate's skills?
let descNotSkill = 0;
for (const c of cands) for (const e of c.experiences) { const m = e.description.match(pat); if (m && (!c.skills.includes(m[3]) || !c.skills.includes(m[4]))) descNotSkill++; }
console.log('descriptions mentioning a skill not in skills[]:', descNotSkill);
// Distinct years differences between seniority bands and the title at first job
console.log('years range by seniority checked in profile.js');
