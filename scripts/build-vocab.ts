// Builds lib/search/vocab.json from seed/candidates.json.
// The search filter schema only accepts values listed here, so the LLM can
// never invent a city, skill or school the data does not contain.
// Output is sorted so re-running it gives a byte-identical file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCandidates } from './lib/candidates';

const OUT = 'lib/search/vocab.json';

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));

const candidates = loadCandidates();

const companyTypes = new Map<string, string>();
for (const c of candidates) {
  for (const e of c.experiences) {
    const known = companyTypes.get(e.company);
    if (known && known !== e.company_type) {
      throw new Error(`Company ${e.company} has two types: ${known} and ${e.company_type}`);
    }
    companyTypes.set(e.company, e.company_type);
  }
}

const vocab = {
  cities: sorted(candidates.map((c) => c.location.city)),
  roles: sorted(candidates.map((c) => c.role)),
  seniorities: ['junior', 'mid', 'senior', 'staff'], // ordered by band, not alphabetically
  skills: sorted(candidates.flatMap((c) => c.skills)),
  company_types: sorted(companyTypes.values()),
  companies: sorted(companyTypes.keys()).map((name) => ({ name, type: companyTypes.get(name)! })),
  schools: sorted(candidates.flatMap((c) => c.education.map((e) => e.school))),
  degrees: sorted(candidates.flatMap((c) => c.education.map((e) => e.degree))),
  fields: sorted(candidates.flatMap((c) => c.education.map((e) => e.field))),
  years_experience: {
    min: Math.min(...candidates.map((c) => c.years_experience)),
    max: Math.max(...candidates.map((c) => c.years_experience)),
  },
};

mkdirSync('lib/search', { recursive: true });
writeFileSync(OUT, JSON.stringify(vocab, null, 2) + '\n');
console.log(
  `build-vocab: ${OUT} (${vocab.cities.length} cities, ${vocab.roles.length} roles, ` +
    `${vocab.skills.length} skills, ${vocab.companies.length} companies, ${vocab.schools.length} schools)`,
);
