// Generates the demo data (npm run generate-seed). Deterministic: a fixed seed
// and no clock, so every run writes byte-identical files.
//
// Writes:
//   seed/candidates.json     5,000 fake candidates (names and companies are invented)
//   seed/queries.json        10 example briefs with the ids that match them
//   seed/holdout.json        40 more briefs, for checking the prompt on wording it was not written for
//   seed/stripe-events.json  signed sample webhook events for acme and globex
//   public/logos/*.svg       one logo per company (initials on a coloured tile)
//
// Portraits are inline SVG data URIs (initials on a coloured circle), so the app
// needs no image host. The expected ids for each brief come from matches()
// below: plain TypeScript over the generated objects, independent of the SQL
// function, so `npm run test:sql` and `npm run eval` have a real ground truth.
//
// Shape of a candidate: see scripts/lib/candidates.ts and docs/data-notes.md.
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const COUNT = 5000;
const NOW_YEAR = 2026; // "today" for career dates; fixed so output never changes
const WEBHOOK_SECRET = 'whsec_findlark_demo_sample';

// ---------------------------------------------------------------------------
// Random numbers: mulberry32, a tiny seeded PRNG. Same seed, same data.
// ---------------------------------------------------------------------------
let state = 0x5eed1a2c;
function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) return item;
  }
  return items[items.length - 1][0];
}
function sample<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------------------
// Vocabulary. Cities, skills, roles, schools and degrees are ordinary real-world
// values; every person and company name is invented.
// ---------------------------------------------------------------------------
const CITIES = [
  ['New York', 'NY', 22], ['San Francisco', 'CA', 18], ['Los Angeles', 'CA', 10], ['Seattle', 'WA', 8],
  ['Chicago', 'IL', 8], ['Austin', 'TX', 8], ['Boston', 'MA', 8], ['Denver', 'CO', 6],
  ['Atlanta', 'GA', 6], ['Miami', 'FL', 6],
] as const;

type Group = 'engineering' | 'data' | 'design' | 'business';

// Each role family has its own skills. A few are shared (React, Python, SQL...),
// which is what makes "React engineers" a skill search across roles.
const ROLES: { name: string; weight: number; group: Group; skills: string[] }[] = [
  { name: 'Frontend Engineer', weight: 12, group: 'engineering',
    skills: ['Accessibility', 'CSS', 'GraphQL', 'JavaScript', 'Next.js', 'React', 'Svelte', 'Tailwind', 'TypeScript', 'Vue'] },
  { name: 'Full Stack Engineer', weight: 12, group: 'engineering',
    skills: ['AWS', 'GraphQL', 'Next.js', 'Node.js', 'Postgres', 'Python', 'React', 'Ruby on Rails', 'Tailwind', 'TypeScript'] },
  { name: 'Backend Engineer', weight: 11, group: 'engineering',
    skills: ['AWS', 'Go', 'Java', 'Kafka', 'Kubernetes', 'Node.js', 'Postgres', 'Python', 'Redis', 'Rust', 'gRPC'] },
  { name: 'Mobile Engineer', weight: 7, group: 'engineering',
    skills: ['Android', 'Flutter', 'Kotlin', 'React Native', 'Swift', 'TypeScript', 'iOS'] },
  { name: 'DevOps Engineer', weight: 6, group: 'engineering',
    skills: ['AWS', 'Ansible', 'CI/CD', 'Datadog', 'Docker', 'GCP', 'Kubernetes', 'Linux', 'Terraform'] },
  { name: 'Data Engineer', weight: 7, group: 'engineering',
    skills: ['AWS', 'Airflow', 'Kafka', 'Python', 'SQL', 'Scala', 'Snowflake', 'Spark', 'dbt'] },
  { name: 'Machine Learning Engineer', weight: 6, group: 'engineering',
    skills: ['CUDA', 'Kubernetes', 'LLMs', 'MLOps', 'PyTorch', 'Python', 'SQL', 'TensorFlow'] },
  { name: 'Data Scientist', weight: 6, group: 'data',
    skills: ['A/B Testing', 'Machine Learning', 'Pandas', 'Python', 'R', 'SQL', 'Statistics', 'Tableau'] },
  { name: 'Product Designer', weight: 8, group: 'design',
    skills: ['Design Systems', 'Figma', 'Interaction Design', 'Prototyping', 'User Research', 'Webflow'] },
  { name: 'Product Manager', weight: 8, group: 'business',
    skills: ['A/B Testing', 'Analytics', 'Jira', 'Pricing', 'Roadmapping', 'SQL', 'User Research'] },
  { name: 'Account Executive', weight: 6, group: 'business',
    skills: ['Enterprise Sales', 'Negotiation', 'Outbound', 'Pipeline Management', 'SaaS', 'Salesforce'] },
  { name: 'Marketing Manager', weight: 6, group: 'business',
    skills: ['Brand', 'Content Marketing', 'HubSpot', 'Lifecycle Marketing', 'Paid Social', 'SEO'] },
  { name: 'Recruiter', weight: 5, group: 'business',
    skills: ['Employer Branding', 'Greenhouse', 'Interviewing', 'Sourcing', 'Technical Recruiting'] },
];

// Bands never overlap, so a seniority word and a years range select the same people.
const SENIORITY_BANDS = [
  { name: 'junior', prefix: 'Junior ', min: 0, max: 2 },
  { name: 'mid', prefix: '', min: 3, max: 5 },
  { name: 'senior', prefix: 'Senior ', min: 6, max: 9 },
  { name: 'staff', prefix: 'Staff ', min: 10, max: 15 },
] as const;
const bandFor = (years: number) => SENIORITY_BANDS.find((b) => years >= b.min && years <= b.max)!;

const SCHOOLS = [
  'Carnegie Mellon University', 'Columbia University', 'Cornell University', 'Georgia Tech', 'MIT',
  'New York University', 'Northeastern University', 'Stanford University', 'UC Berkeley',
  'University of Illinois', 'University of Michigan', 'University of Texas at Austin', 'University of Washington',
];

const FIELDS: Record<Group, string[]> = {
  engineering: ['Computer Science', 'Computer Engineering', 'Electrical Engineering', 'Mathematics'],
  data: ['Computer Science', 'Economics', 'Mathematics', 'Physics', 'Statistics'],
  design: ['Design', 'Fine Arts', 'Human-Computer Interaction', 'Psychology'],
  business: ['Business', 'Communications', 'Economics', 'Marketing', 'Psychology'],
};

const DEGREES: Record<Group, (readonly [string, number])[]> = {
  engineering: [['BS', 52], ['BA', 22], ['MS', 20], ['PhD', 4], ['MBA', 2]],
  data: [['BS', 42], ['BA', 18], ['MS', 22], ['PhD', 16], ['MBA', 2]],
  design: [['BS', 40], ['BA', 30], ['MS', 24], ['PhD', 2], ['MBA', 4]],
  business: [['BS', 44], ['BA', 22], ['MS', 16], ['MBA', 16], ['PhD', 2]],
};

// Invented companies. The only attribute the data has is the type, fixed per company.
const COMPANIES: { name: string; type: 'startup' | 'enterprise' }[] = [
  ...['Brambleworks', 'Cinderloop', 'Fablestack', 'Glintwave', 'Hollowpeak Labs', 'Kelpforge', 'Mossgate',
    'Nimbletide', 'Owlbright', 'Quartzline', 'Ripplefox', 'Sablecraft', 'Thistlebyte', 'Velvetroot', 'Wickerbox',
    'Yarrow Health'].map((name) => ({ name, type: 'startup' as const })),
  ...['Ashford Health', 'Bluewater Media', 'Cobalt Freight', 'Crestfield Systems', 'Granitefield Insurance',
    'Larchmont Software', 'Marbleton Retail', 'Northgate Financial', 'Oakhurst Logistics', 'Redcliff Telecom',
    'Stonebridge Bank', 'Westmark Energy'].map((name) => ({ name, type: 'enterprise' as const })),
];

const FIRST_NAMES = [
  'Adaeze', 'Anouk', 'Aurelio', 'Bastian', 'Bea', 'Caspian', 'Celeste', 'Dalia', 'Dmitri', 'Emeka', 'Esme',
  'Farid', 'Freya', 'Gideon', 'Greta', 'Henrik', 'Hollis', 'Ilse', 'Imani', 'Jasper', 'Jovan', 'Kenji',
  'Keziah', 'Linnea', 'Lorcan', 'Marisol', 'Mireille', 'Nasrin', 'Nikhil', 'Odette', 'Oskar', 'Paloma',
  'Pilar', 'Quentin', 'Rafferty', 'Rosalind', 'Saoirse', 'Soren', 'Tamsin', 'Tobias', 'Ulric', 'Valentina',
  'Vesna', 'Wendell', 'Wren', 'Xiomara', 'Yosef', 'Yusuf', 'Zainab', 'Zelda',
];
const LAST_NAMES = [
  'Abernathy', 'Achterberg', 'Bhattacharya', 'Carrington', 'Castellano', 'Delacroix', 'Dunmore', 'Eriksen',
  'Esposito', 'Fairbanks', 'Ferreira', 'Galloway', 'Halvorsen', 'Hartigan', 'Ishikawa', 'Iwu', 'Jablonski',
  'Juarez', 'Kaur', 'Kowalczyk', 'Lachance', 'Lindqvist', 'Marchetti', 'Nakamura', 'Okonkwo', 'Oyelaran',
  'Pennington', 'Petrakis', 'Quintero', 'Rasmussen', 'Rinaldi', 'Sandoval', 'Szabo', 'Takahashi', 'Thorne',
  'Umeh', 'Underhill', 'Varga', 'Vasquez', 'Whitlock', 'Winslow', 'Yilmaz', 'Zamora',
];

// Muted tones that sit well on the app's warm neutral background; white text on each.
const TILE_COLOURS = ['#1f5550', '#7a4e2d', '#3f5482', '#8a4a5f', '#55652f', '#2f6b78', '#86622a', '#5e4b7a', '#9a4f3c', '#40604a'];

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function avatarDataUri(name: string, colour: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='${colour}'/>` +
    `<text x='32' y='33' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,-apple-system,Segoe UI,sans-serif' ` +
    `font-size='24' font-weight='600' fill='#fbf7ee'>${escapeXml(initials(name))}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function logoSvg(name: string, colour: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${colour}"/>` +
    `<text x="32" y="33" dominant-baseline="middle" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" ` +
    `font-size="26" font-weight="700" fill="#fbf7ee">${escapeXml(initials(name))}</text></svg>\n`
  );
}

const logoUrl = (company: string) => `/logos/${slug(company)}.svg`;

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
type Experience = {
  title: string; company: string; company_logo_url: string; company_type: 'startup' | 'enterprise';
  start_year: number; end_year: number | null; description: string;
};
type Education = { school: string; degree: string; field: string; graduation_year: number };
type Candidate = {
  id: string; full_name: string; avatar_url: string; headline: string; current_title: string;
  current_company: string; current_company_logo_url: string; role: string; seniority: string;
  years_experience: number; location: { city: string; state: string; country: string }; open_to_work: boolean;
  skills: string[]; experiences: Experience[]; education: Education[];
};

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

function makeCandidate(n: number): Candidate {
  const id = `cand_${String(n).padStart(4, '0')}`;
  const full_name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const role = weighted(ROLES.map((r) => [r, r.weight] as const));
  const years = int(0, 15);
  const band = bandFor(years);
  const [city, stateCode] = weighted(CITIES.map(([c, s, w]) => [[c, s] as const, w] as const));
  const skills = sample(role.skills, int(3, Math.min(6, role.skills.length))).sort(byName);

  // Work history, newest first. It spans the whole career; a person never
  // changes role family, and each job's title uses the seniority they had when
  // they started it.
  const careerStart = NOW_YEAR - years;
  const jobs = Math.min(weighted([[1, 45], [2, 26], [3, 17], [4, 12]] as const), years + 1);
  const cuts = sample(Array.from({ length: years }, (_, i) => careerStart + 1 + i), jobs - 1).sort((a, b) => a - b);
  const starts = [careerStart, ...cuts];
  const experiences: Experience[] = [];
  let company = pick(COMPANIES);
  for (let i = 0; i < starts.length; i++) {
    if (i > 0 && random() > 0.25) company = pick(COMPANIES); // a quarter of moves are promotions in place
    const isCurrent = i === starts.length - 1;
    const title = (isCurrent ? band : bandFor(starts[i] - careerStart)).prefix + role.name;
    const [a, b] = sample(skills, 2);
    experiences.unshift({
      title,
      company: company.name,
      company_logo_url: logoUrl(company.name),
      company_type: company.type,
      start_year: starts[i],
      end_year: isCurrent ? null : starts[i + 1],
      description: `${title} at ${company.name}, working mostly with ${a} and ${b}.`,
    });
  }

  const education: Education[] = [{
    school: pick(SCHOOLS),
    degree: weighted(DEGREES[role.group]),
    field: pick(FIELDS[role.group]),
    graduation_year: careerStart - int(0, 1),
  }];

  const current = experiences[0];
  return {
    id,
    full_name,
    avatar_url: avatarDataUri(full_name, pick(TILE_COLOURS)),
    headline: `${current.title} · ${sample(skills, 3).join(', ')}`,
    current_title: current.title,
    current_company: current.company,
    current_company_logo_url: current.company_logo_url,
    role: role.name,
    seniority: band.name,
    years_experience: years,
    location: { city, state: stateCode, country: 'US' },
    open_to_work: random() < 0.3,
    skills,
    experiences,
    education,
  };
}

// ---------------------------------------------------------------------------
// Briefs and their ground truth
// ---------------------------------------------------------------------------
// Filters use the same names and meaning as lib/search/schema.ts, but are
// evaluated here by matches(), not by SQL. Every filter is required (AND).
type Spec = {
  roles?: string[]; seniorities?: string[]; min_years?: number; max_years?: number; cities?: string[];
  skills?: string[]; skills_any?: string[]; open_to_work?: boolean; companies?: string[]; company_types?: string[];
  current_job_only?: boolean; schools?: string[]; degrees?: string[]; fields?: string[];
  unsupported?: { text: string }[];
};
type Brief = { category: string; brief: string; filters: Spec };

const ENGINEERING_ROLES = ROLES.filter((r) => r.group === 'engineering').map((r) => r.name);

const EXAMPLES: Brief[] = [
  { category: 'skill+city+company type', brief: 'senior TypeScript engineers in Chicago who have worked at a startup',
    filters: { seniorities: ['senior'], skills: ['TypeScript'], cities: ['Chicago'], company_types: ['startup'] } },
  { category: 'role+city+skill', brief: 'data engineers in Denver who know Airflow',
    filters: { roles: ['Data Engineer'], cities: ['Denver'], skills: ['Airflow'] } },
  { category: 'role+degree', brief: 'product managers with an MBA',
    filters: { roles: ['Product Manager'], degrees: ['MBA'] } },
  { category: 'role+two skills', brief: 'mobile engineers who know Kotlin and Android',
    filters: { roles: ['Mobile Engineer'], skills: ['Kotlin', 'Android'] } },
  { category: 'seniority+role+city', brief: 'staff backend engineers in San Francisco',
    filters: { seniorities: ['staff'], roles: ['Backend Engineer'], cities: ['San Francisco'] } },
  { category: 'role+school', brief: 'data scientists who studied at Carnegie Mellon',
    filters: { roles: ['Data Scientist'], schools: ['Carnegie Mellon University'] } },
  { category: 'role+city+open', brief: 'account executives in Atlanta who are open to work',
    filters: { roles: ['Account Executive'], cities: ['Atlanta'], open_to_work: true } },
  { category: 'seniority+role+city', brief: 'junior product designers in Los Angeles',
    filters: { seniorities: ['junior'], roles: ['Product Designer'], cities: ['Los Angeles'] } },
  { category: 'role+skill+city', brief: 'recruiters in Seattle with technical recruiting experience',
    filters: { roles: ['Recruiter'], cities: ['Seattle'], skills: ['Technical Recruiting'] } },
  { category: 'unsupported', brief: 'marketing managers who speak Spanish',
    filters: { roles: ['Marketing Manager'], unsupported: [{ text: 'speak Spanish' }] } },
];

const HOLDOUT: Brief[] = [
  { category: 'abbreviation', brief: 'sr full stack devs in NYC who know Rails',
    filters: { seniorities: ['senior'], roles: ['Full Stack Engineer'], cities: ['New York'], skills: ['Ruby on Rails'] } },
  { category: 'abbreviation', brief: 'jr frontend engineers in SF who know Vue',
    filters: { seniorities: ['junior'], roles: ['Frontend Engineer'], cities: ['San Francisco'], skills: ['Vue'] } },
  { category: 'synonym', brief: 'devops engineers in Austin with k8s and terraform',
    filters: { roles: ['DevOps Engineer'], cities: ['Austin'], skills: ['Kubernetes', 'Terraform'] } },
  { category: 'synonym', brief: 'backend engineers who know golang and postgresql',
    filters: { roles: ['Backend Engineer'], skills: ['Go', 'Postgres'] } },
  { category: 'synonym', brief: 'data scientists in the Bay Area',
    filters: { roles: ['Data Scientist'], cities: ['San Francisco'] } },
  { category: 'or-list', brief: 'product designers in Boston or Miami',
    filters: { roles: ['Product Designer'], cities: ['Boston', 'Miami'] } },
  { category: 'or-list', brief: 'frontend engineers who know Vue or Svelte',
    filters: { roles: ['Frontend Engineer'], skills_any: ['Vue', 'Svelte'] } },
  { category: 'or-list', brief: 'senior or staff ML engineers in San Francisco',
    filters: { seniorities: ['senior', 'staff'], roles: ['Machine Learning Engineer'], cities: ['San Francisco'] } },
  { category: 'or-list', brief: 'product people in Denver',
    filters: { roles: ['Product Designer', 'Product Manager'], cities: ['Denver'] } },
  { category: 'years', brief: 'data scientists with 5+ years of experience',
    filters: { roles: ['Data Scientist'], min_years: 5 } },
  { category: 'years', brief: 'account executives in Chicago with 3 to 6 years of experience',
    filters: { roles: ['Account Executive'], cities: ['Chicago'], min_years: 3, max_years: 6 } },
  { category: 'years', brief: 'full stack engineers with at most 2 years of experience',
    filters: { roles: ['Full Stack Engineer'], max_years: 2 } },
  { category: 'seniority', brief: 'mid-level DevOps engineers',
    filters: { seniorities: ['mid'], roles: ['DevOps Engineer'] } },
  { category: 'seniority', brief: 'entry-level recruiters in Atlanta',
    filters: { seniorities: ['junior'], roles: ['Recruiter'], cities: ['Atlanta'] } },
  { category: 'company', brief: 'engineers who have worked at Cobalt Freight',
    filters: { roles: ENGINEERING_ROLES, companies: ['Cobalt Freight'] } },
  { category: 'company', brief: 'people who worked at Brambleworks',
    filters: { companies: ['Brambleworks'] } },
  { category: 'company', brief: 'product managers currently at Northgate Financial',
    filters: { roles: ['Product Manager'], companies: ['Northgate Financial'], current_job_only: true } },
  { category: 'company type', brief: 'backend engineers currently at a startup',
    filters: { roles: ['Backend Engineer'], company_types: ['startup'], current_job_only: true } },
  { category: 'company type', brief: 'product designers who have worked at an enterprise company',
    filters: { roles: ['Product Designer'], company_types: ['enterprise'] } },
  { category: 'school', brief: 'machine learning engineers from Stanford',
    filters: { roles: ['Machine Learning Engineer'], schools: ['Stanford University'] } },
  { category: 'school', brief: 'data engineers who went to UIUC',
    filters: { roles: ['Data Engineer'], schools: ['University of Illinois'] } },
  { category: 'school', brief: 'frontend engineers who studied at UT Austin',
    filters: { roles: ['Frontend Engineer'], schools: ['University of Texas at Austin'] } },
  { category: 'school+city', brief: 'recruiters in New York who went to NYU',
    filters: { roles: ['Recruiter'], cities: ['New York'], schools: ['New York University'] } },
  { category: 'degree', brief: 'machine learning engineers with a PhD',
    filters: { roles: ['Machine Learning Engineer'], degrees: ['PhD'] } },
  { category: 'degree', brief: "product designers with a master's degree",
    filters: { roles: ['Product Designer'], degrees: ['MS', 'MBA'] } },
  { category: 'field', brief: 'backend engineers with a CS degree',
    filters: { roles: ['Backend Engineer'], fields: ['Computer Science'] } },
  { category: 'field', brief: 'data scientists with a physics degree',
    filters: { roles: ['Data Scientist'], fields: ['Physics'] } },
  { category: 'open to work', brief: 'staff data engineers who are open to work',
    filters: { seniorities: ['staff'], roles: ['Data Engineer'], open_to_work: true } },
  { category: 'open to work', brief: 'mobile engineers in Seattle looking for a new job',
    filters: { roles: ['Mobile Engineer'], cities: ['Seattle'], open_to_work: true } },
  { category: 'skill only', brief: 'React Native developers',
    filters: { skills: ['React Native'] } },
  { category: 'skill only', brief: 'people who know Rust',
    filters: { skills: ['Rust'] } },
  { category: 'skills', brief: 'data engineers with Spark, Kafka and Scala',
    filters: { roles: ['Data Engineer'], skills: ['Spark', 'Kafka', 'Scala'] } },
  { category: 'skills', brief: 'marketing managers with SEO and HubSpot experience',
    filters: { roles: ['Marketing Manager'], skills: ['SEO', 'HubSpot'] } },
  { category: 'skill vs role', brief: 'data scientists who know machine learning and pandas',
    filters: { roles: ['Data Scientist'], skills: ['Machine Learning', 'Pandas'] } },
  { category: 'optional part', brief: 'backend engineers in Boston, Kafka is a nice to have',
    filters: { roles: ['Backend Engineer'], cities: ['Boston'] } },
  { category: 'unsupported', brief: 'backend engineers who speak German',
    filters: { roles: ['Backend Engineer'], unsupported: [{ text: 'speak German' }] } },
  { category: 'unsupported', brief: 'principal engineers in Seattle',
    filters: { cities: ['Seattle'], unsupported: [{ text: 'principal' }] } },
  { category: 'unsupported', brief: 'frontend engineers in Portland',
    filters: { roles: ['Frontend Engineer'], unsupported: [{ text: 'Portland' }] } },
  { category: 'unsupported', brief: 'account executives who managed a team of 10',
    filters: { roles: ['Account Executive'], unsupported: [{ text: 'managed a team of 10' }] } },
  { category: 'vague', brief: 'great designers',
    filters: { roles: ['Product Designer'], unsupported: [{ text: 'great' }] } },
];

const has = (list: string[] | undefined) => Array.isArray(list) && list.length > 0;

/** True when the candidate meets every filter. Mirrors lib/search/schema.ts, written independently of the SQL. */
function matches(c: Candidate, f: Spec): boolean {
  if (has(f.roles) && !f.roles!.includes(c.role)) return false;
  if (has(f.seniorities) && !f.seniorities!.includes(c.seniority)) return false;
  if (has(f.cities) && !f.cities!.includes(c.location.city)) return false;
  if (has(f.skills) && !f.skills!.every((s) => c.skills.includes(s))) return false;
  if (has(f.skills_any) && !f.skills_any!.some((s) => c.skills.includes(s))) return false;
  if (f.min_years !== undefined && c.years_experience < f.min_years) return false;
  if (f.max_years !== undefined && c.years_experience > f.max_years) return false;
  if (f.open_to_work !== undefined && c.open_to_work !== f.open_to_work) return false;
  const jobs = c.experiences.filter((e) => !f.current_job_only || e.end_year === null);
  if (has(f.companies) && !jobs.some((e) => f.companies!.includes(e.company))) return false;
  if (has(f.company_types) && !jobs.some((e) => f.company_types!.includes(e.company_type))) return false;
  if (has(f.schools) || has(f.degrees) || has(f.fields)) {
    const ok = c.education.some((ed) =>
      (!has(f.schools) || f.schools!.includes(ed.school)) &&
      (!has(f.degrees) || f.degrees!.includes(ed.degree)) &&
      (!has(f.fields) || f.fields!.includes(ed.field)));
    if (!ok) return false;
  }
  return true;
}

/** Ids in rank order (years desc, then id). Any unsupported part means nobody. */
function expectedIds(candidates: Candidate[], f: Spec): string[] {
  if (f.unsupported?.length) return [];
  const constrained = Object.entries(f).some(([k, v]) => k !== 'current_job_only' && (Array.isArray(v) ? v.length > 0 : v !== undefined));
  if (!constrained) return [];
  return candidates
    .filter((c) => matches(c, f))
    .sort((a, b) => b.years_experience - a.years_experience || (a.id < b.id ? -1 : 1))
    .map((c) => c.id);
}

/** Catches a typo in a brief's filters: every value must exist in the vocabulary above. */
function checkSpec(b: Brief) {
  const known: Record<string, string[]> = {
    roles: ROLES.map((r) => r.name),
    seniorities: SENIORITY_BANDS.map((s) => s.name),
    cities: CITIES.map(([c]) => c),
    skills: ROLES.flatMap((r) => r.skills),
    skills_any: ROLES.flatMap((r) => r.skills),
    companies: COMPANIES.map((c) => c.name),
    company_types: ['startup', 'enterprise'],
    schools: SCHOOLS,
    degrees: ['BA', 'BS', 'MBA', 'MS', 'PhD'],
    fields: Object.values(FIELDS).flat(),
  };
  for (const [field, values] of Object.entries(b.filters)) {
    if (!(field in known)) continue;
    for (const v of values as string[]) {
      if (!known[field].includes(v)) throw new Error(`generate-seed: "${b.brief}" uses unknown ${field} value "${v}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Stripe events: a subscribe, its redelivery, an out-of-order pair and a cancel.
// ---------------------------------------------------------------------------
function stripeEvents() {
  const T = Date.UTC(2026, 9, 1, 15, 0, 0) / 1000; // fixed, so signatures never change
  const sign = (payload: string, t: number) =>
    `t=${t},v1=${createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`, 'utf8').digest('hex')}`;
  const payload = (id: string, type: string, created: number, company: string, status: string) =>
    JSON.stringify({
      id, object: 'event', api_version: '2025-09-30', created, livemode: false, type,
      data: { object: { id: `sub_demo_${company}`, object: 'subscription', customer: `cus_demo_${company}`,
        status, metadata: { company }, current_period_end: created + 30 * 86400 } },
    });

  const acmeSubscribes = payload('evt_demo_acme_1', 'customer.subscription.created', T, 'acme', 'active');
  const globexOlder = payload('evt_demo_globex_1', 'customer.subscription.created', T + 60, 'globex', 'incomplete');
  const globexNewer = payload('evt_demo_globex_2', 'customer.subscription.updated', T + 120, 'globex', 'active');
  const acmeCancels = payload('evt_demo_acme_2', 'customer.subscription.deleted', T + 180, 'acme', 'canceled');

  // `t` in the header is when the event was (re)sent; `created` in the body is
  // when it happened. The older globex event is sent last, with the later `t`.
  const events = [
    { description: 'acme subscribes', t: T, payload: acmeSubscribes, expected_result: 'applied' },
    { description: 'the same event delivered again', t: T + 5, payload: acmeSubscribes, expected_result: 'duplicate' },
    { description: "globex's newer event arrives first", t: T + 130, payload: globexNewer, expected_result: 'applied' },
    { description: "globex's older event arrives late", t: T + 135, payload: globexOlder, expected_result: 'stale' },
    { description: 'acme cancels', t: T + 180, payload: acmeCancels, expected_result: 'applied' },
  ];
  return {
    note:
      `Demo webhook events signed with ${WEBHOOK_SECRET}. Send each payload byte for byte as the request body ` +
      'with its Stripe-Signature header. The signatures are old, so Stripe libraries with a default tolerance reject them; this app does not check age.',
    events: events.map(({ description, t, payload, expected_result }) => ({
      description, headers: { 'Stripe-Signature': sign(payload, t) }, payload, expected_result,
    })),
    expected_plans_after: { acme: 'free', globex: 'paid' },
  };
}

// ---------------------------------------------------------------------------

function main() {
  const candidates = Array.from({ length: COUNT }, (_, i) => makeCandidate(i + 1));

  const withIds = (briefs: Brief[]) =>
    briefs.map((b) => {
      checkSpec(b);
      return { ...b, expected_ids: expectedIds(candidates, b.filters) };
    });
  const queries = withIds(EXAMPLES);
  const holdout = withIds(HOLDOUT);

  mkdirSync('seed', { recursive: true });
  mkdirSync('public/logos', { recursive: true });
  writeFileSync('seed/candidates.json', JSON.stringify(candidates, null, 2) + '\n');
  writeFileSync('seed/queries.json', JSON.stringify(queries, null, 2) + '\n');
  writeFileSync('seed/holdout.json', JSON.stringify(holdout, null, 2) + '\n');
  writeFileSync('seed/stripe-events.json', JSON.stringify(stripeEvents(), null, 2) + '\n');
  COMPANIES.forEach((c, i) => writeFileSync(`public/logos/${slug(c.name)}.svg`, logoSvg(c.name, TILE_COLOURS[i % TILE_COLOURS.length])));

  console.log(`generate-seed: ${candidates.length} candidates, ${COMPANIES.length} logos, ` +
    `${queries.length} example briefs, ${holdout.length} holdout briefs, 5 Stripe events`);
  for (const b of [...queries, ...holdout]) console.log(`  ${String(b.expected_ids.length).padStart(4)}  ${b.brief}`);
}

main();
