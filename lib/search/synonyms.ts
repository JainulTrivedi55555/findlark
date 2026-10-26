// Maps brief wording to vocabulary values. Pure, no I/O.
//
// The data itself is clean (docs/data-notes.md); the mess is on the
// brief side: "NYC", "k8s", "CMU". The model is told these too, but we apply
// them again after it answers so a value like "Golang" still lands on "Go".
//
// Keys are lowercase. A key can map to several values ("master's" -> MS, MBA).
// Exact vocabulary matches (case-insensitive) need no entry here.
import type { ListField } from './schema';
import { VOCAB } from './schema';

type SynonymMap = Record<string, string[]>;

const CITIES: SynonymMap = {
  nyc: ['New York'],
  'new york city': ['New York'],
  ny: ['New York'],
  manhattan: ['New York'],
  brooklyn: ['New York'],
  sf: ['San Francisco'],
  'san fran': ['San Francisco'],
  'bay area': ['San Francisco'], // judgement call: the only Bay Area city we have
  'sf bay area': ['San Francisco'],
  la: ['Los Angeles'],
  'l.a.': ['Los Angeles'],
  atx: ['Austin'],
  chi: ['Chicago'],
};

const SKILLS: SynonymMap = {
  k8s: ['Kubernetes'],
  kube: ['Kubernetes'],
  golang: ['Go'],
  js: ['JavaScript'],
  ts: ['TypeScript'],
  postgresql: ['Postgres'],
  psql: ['Postgres'],
  postgre: ['Postgres'],
  node: ['Node.js'],
  nodejs: ['Node.js'],
  'node js': ['Node.js'],
  next: ['Next.js'],
  nextjs: ['Next.js'],
  rails: ['Ruby on Rails'],
  ror: ['Ruby on Rails'],
  reactjs: ['React'],
  'react.js': ['React'],
  'react-native': ['React Native'],
  vuejs: ['Vue'],
  'vue.js': ['Vue'],
  ml: ['Machine Learning'], // the skill; "ML engineer" is a role, handled in ROLES
  'ab testing': ['A/B Testing'],
  'a/b tests': ['A/B Testing'],
  cicd: ['CI/CD'],
  'ci cd': ['CI/CD'],
  llm: ['LLMs'],
  'large language models': ['LLMs'],
  'google cloud': ['GCP'],
  'amazon web services': ['AWS'],
  'apache spark': ['Spark'],
  'apache kafka': ['Kafka'],
  'apache airflow': ['Airflow'],
  'user testing': ['User Research'],
  'ux research': ['User Research'],
};

const ROLES: SynonymMap = {
  'frontend developer': ['Frontend Engineer'],
  'front-end engineer': ['Frontend Engineer'],
  'front end engineer': ['Frontend Engineer'],
  'backend developer': ['Backend Engineer'],
  'back-end engineer': ['Backend Engineer'],
  'back end engineer': ['Backend Engineer'],
  'fullstack engineer': ['Full Stack Engineer'],
  'full-stack engineer': ['Full Stack Engineer'],
  'full stack developer': ['Full Stack Engineer'],
  'ml engineer': ['Machine Learning Engineer'],
  'mobile developer': ['Mobile Engineer'],
  'devops': ['DevOps Engineer'],
  'product designer': ['Product Designer'],
  'ux designer': ['Product Designer'],
  pm: ['Product Manager'],
  ae: ['Account Executive'],
  'account exec': ['Account Executive'],
  marketer: ['Marketing Manager'],
  'talent acquisition': ['Recruiter'],
};

const SENIORITIES: SynonymMap = {
  jr: ['junior'],
  'entry level': ['junior'],
  'entry-level': ['junior'],
  'mid-level': ['mid'],
  'mid level': ['mid'],
  intermediate: ['mid'],
  sr: ['senior'],
  // No "lead" or "principal": the data has no such titles, and mapping them
  // to staff would be a guess (docs/data-notes.md).
};

const SCHOOLS: SynonymMap = {
  stanford: ['Stanford University'],
  berkeley: ['UC Berkeley'],
  cal: ['UC Berkeley'],
  'university of california, berkeley': ['UC Berkeley'],
  cmu: ['Carnegie Mellon University'],
  'carnegie mellon': ['Carnegie Mellon University'],
  'ut austin': ['University of Texas at Austin'],
  'university of texas': ['University of Texas at Austin'],
  uiuc: ['University of Illinois'],
  'university of illinois urbana-champaign': ['University of Illinois'],
  nyu: ['New York University'],
  uw: ['University of Washington'], // could mean Wisconsin, which we do not have
  columbia: ['Columbia University'],
  cornell: ['Cornell University'],
  michigan: ['University of Michigan'],
  umich: ['University of Michigan'],
  northeastern: ['Northeastern University'],
  'massachusetts institute of technology': ['MIT'],
  'georgia institute of technology': ['Georgia Tech'],
  gatech: ['Georgia Tech'],
};

const DEGREES: SynonymMap = {
  'ph.d.': ['PhD'],
  'ph.d': ['PhD'],
  doctorate: ['PhD'],
  "master's": ['MS', 'MBA'], // choice: a master's is either; MS alone means MS
  masters: ['MS', 'MBA'],
  'master’s': ['MS', 'MBA'],
  msc: ['MS'],
  'm.s.': ['MS'],
  "bachelor's": ['BS', 'BA'],
  bachelors: ['BS', 'BA'],
  'bachelor’s': ['BS', 'BA'],
  bsc: ['BS'],
  'b.s.': ['BS'],
  'b.a.': ['BA'],
};

const FIELDS: SynonymMap = {
  cs: ['Computer Science'],
  'comp sci': ['Computer Science'],
  ee: ['Electrical Engineering'],
  hci: ['Human-Computer Interaction'],
  math: ['Mathematics'],
  maths: ['Mathematics'],
  stats: ['Statistics'],
  econ: ['Economics'],
};

const COMPANY_TYPES: SynonymMap = {
  startups: ['startup'],
  'start-up': ['startup'],
  // No "big company" -> enterprise: the data has no company size, so that would be a guess.
};

export const SYNONYMS: Record<ListField, SynonymMap> = {
  roles: ROLES,
  seniorities: SENIORITIES,
  cities: CITIES,
  skills: SKILLS,
  skills_any: SKILLS,
  companies: {},
  company_types: COMPANY_TYPES,
  schools: SCHOOLS,
  degrees: DEGREES,
  fields: FIELDS,
};

const VOCAB_BY_FIELD: Record<ListField, readonly string[]> = {
  roles: VOCAB.roles,
  seniorities: VOCAB.seniorities,
  cities: VOCAB.cities,
  skills: VOCAB.skills,
  skills_any: VOCAB.skills,
  companies: VOCAB.companies.map((c) => c.name),
  company_types: VOCAB.company_types,
  schools: VOCAB.schools,
  degrees: VOCAB.degrees,
  fields: VOCAB.fields,
};

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Maps one raw value to vocabulary values for a field.
 * Returns [] when the value is not in the vocabulary and has no synonym.
 */
export function toVocab(field: ListField, raw: string): string[] {
  const key = normalise(raw);
  const exact = VOCAB_BY_FIELD[field].find((v) => normalise(v) === key);
  if (exact) return [exact];
  return SYNONYMS[field][key] ?? [];
}

/**
 * Synonym lines for the model's system prompt, one per target value, e.g.
 * `skills: k8s | kube -> Kubernetes`. Grouped to keep the cached prompt short.
 */
export function synonymPromptLines(): string[] {
  const lines: string[] = [];
  for (const [field, map] of Object.entries(SYNONYMS)) {
    if (field === 'skills_any') continue; // same map as skills
    const byTarget = new Map<string, string[]>(); // "Kubernetes" -> ["k8s", "kube"]
    for (const [from, to] of Object.entries(map)) {
      const target = to.join(' + ');
      byTarget.set(target, [...(byTarget.get(target) ?? []), from]);
    }
    for (const [target, froms] of byTarget) lines.push(`${field}: ${froms.join(' | ')} -> ${target}`);
  }
  return lines;
}
