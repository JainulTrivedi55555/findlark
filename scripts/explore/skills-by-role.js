// Which roles hold each skill? Tells us whether a skill implies a role.
// Usage: node scripts/explore/skills-by-role.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const cands = JSON.parse(fs.readFileSync(path.join(root, 'seed/candidates.json'), 'utf8'));
const m = {};
for (const c of cands) for (const s of c.skills) { (m[s] ||= {})[c.role] = (m[s][c.role] || 0) + 1; }
for (const s of Object.keys(m).sort()) {
  const roles = Object.entries(m[s]).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`);
  console.log(`${s}: ${roles.join(', ')}`);
}
