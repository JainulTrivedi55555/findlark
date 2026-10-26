// The search filter schema. Pure: no I/O, safe to import from UI and server.
//
// It only contains filters the data can answer (docs/data-notes.md). Every enum
// value comes from lib/search/vocab.json, generated from the candidate data, so
// a filter can never name a city, skill or school that does not exist.
//
// How values combine (docs/data-notes.md):
//   - Different filters are always AND: every constraint is required.
//   - Single-valued attributes are OR inside the list, because a person has only
//     one of each: roles, seniorities, cities, schools, degrees, fields.
//     "PM or designer" = roles [PM, Designer]; "master's" = degrees [MS, MBA].
//   - skills is AND: "knows Go and Kubernetes" needs both.
//   - skills_any is OR, for an explicit "React or Vue".
//   - companies / company_types: at least one experience matches (current or past:
//     "worked at a startup"). Several companies = any of them.
//   - current_job_only narrows companies / company_types to the current job.
//   - Years are inclusive bounds on years_experience.
//
// `unsupported` lists parts of the brief the data cannot answer (languages,
// salary, visa...). Every constraint is required, so anything unsupported means
// the search returns zero results with a reason, never everyone.
import { z } from 'zod';
import vocab from './vocab.json';

export const VOCAB = vocab;

// z.enum needs a non-empty tuple; vocab.json always has values for these.
const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);

export const Role = oneOf(vocab.roles);
export const Seniority = oneOf(vocab.seniorities);
export const City = oneOf(vocab.cities);
export const Skill = oneOf(vocab.skills);
export const CompanyType = oneOf(vocab.company_types);
export const Company = oneOf(vocab.companies.map((c) => c.name));
export const School = oneOf(vocab.schools);
export const Degree = oneOf(vocab.degrees);
export const Field = oneOf(vocab.fields);

const Years = z.number().int().min(0).max(60).nullable().default(null);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(30).default([]);

export const UnsupportedItem = z.object({ text: z.string().trim().min(1).max(200) });

export const Filters = z
  .object({
    roles: list(Role),
    seniorities: list(Seniority),
    min_years: Years,
    max_years: Years,
    cities: list(City),
    skills: list(Skill),
    skills_any: list(Skill),
    open_to_work: z.boolean().nullable().default(null),
    companies: list(Company),
    company_types: list(CompanyType),
    current_job_only: z.boolean().default(false),
    schools: list(School),
    degrees: list(Degree),
    fields: list(Field),
    unsupported: z.array(UnsupportedItem).max(30).default([]),
  })
  .strict();

export type Filters = z.infer<typeof Filters>;

/** Field names that hold vocabulary lists, in display order. */
export const LIST_FIELDS = [
  'roles',
  'seniorities',
  'cities',
  'skills',
  'skills_any',
  'companies',
  'company_types',
  'schools',
  'degrees',
  'fields',
] as const;
export type ListField = (typeof LIST_FIELDS)[number];

/** True when at least one real constraint is set (unsupported does not count). */
export function hasConstraint(f: Filters): boolean {
  return (
    LIST_FIELDS.some((k) => f[k].length > 0) ||
    f.min_years !== null ||
    f.max_years !== null ||
    f.open_to_work !== null
  );
}

/**
 * Why a search must return nothing, or null if it can run.
 * Rule: no valid filters, or any unsupported (required) constraint => zero results.
 */
export function zeroResultReason(f: Filters): string | null {
  if (f.unsupported.length > 0) {
    const parts = f.unsupported.map((u) => `"${u.text}"`).join(', ');
    return `No candidate data for ${parts}, so no one can be shown as a match.`;
  }
  if (!hasConstraint(f)) {
    return 'The brief has nothing we can filter on. Try a role, skill, city, seniority or school.';
  }
  return null;
}
