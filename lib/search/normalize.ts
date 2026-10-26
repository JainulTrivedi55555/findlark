// Turns the model's raw answer into validated Filters. Pure, no I/O.
//
// 0. the model answers in a compact {field, value} list (prompt.ts);
//    fromModelOutput turns that into the RawFilters shape below
// 1. zod-parse the raw shape (strings, not enums yet)
// 2. map every value through the vocabulary and synonyms
// 3. anything that does not map moves to `unsupported`, so the search returns
//    zero results with a reason instead of silently ignoring a requirement
import { z } from 'zod';
import { OUTPUT_FIELDS } from './prompt';
import { Filters, LIST_FIELDS, type ListField } from './schema';
import { toVocab } from './synonyms';

const RawList = z.array(z.string().max(200)).max(30);

export const RawFilters = z.object({
  roles: RawList,
  seniorities: RawList,
  min_years: z.number().nullable(),
  max_years: z.number().nullable(),
  cities: RawList,
  skills: RawList,
  skills_any: RawList,
  open_to_work: z.boolean().nullable(),
  companies: RawList,
  company_types: RawList,
  current_job_only: z.boolean(),
  schools: RawList,
  degrees: RawList,
  fields: RawList,
  unsupported: z.array(z.object({ text: z.string() })).max(30),
});
export type RawFilters = z.infer<typeof RawFilters>;

// What the model returns (matches OUTPUT_SCHEMA in prompt.ts).
export const ModelOutput = z.object({
  filters: z.array(z.object({ field: z.enum(OUTPUT_FIELDS), value: z.string().max(200) })).max(60),
  unsupported: z.array(z.string()).max(30),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

/**
 * {field, value} pairs -> RawFilters. Lists collect their values. Scalars must
 * parse ("5", "true"); a value that does not, or two values that contradict
 * each other, goes to unsupported, so it can never be dropped silently.
 * Repeated year bounds combine as AND: the strictest one wins.
 */
export function fromModelOutput(output: ModelOutput): RawFilters {
  const raw: RawFilters = {
    roles: [], seniorities: [], min_years: null, max_years: null, cities: [], skills: [], skills_any: [],
    open_to_work: null, companies: [], company_types: [], current_job_only: false, schools: [], degrees: [],
    fields: [], unsupported: output.unsupported.map((text) => ({ text })),
  };
  const unsupported = (field: string, value: string) => raw.unsupported.push({ text: `${field.replaceAll('_', ' ')}: ${value}` });

  for (const { field, value } of output.filters) {
    const v = value.trim();
    if (field === 'min_years' || field === 'max_years') {
      if (!/^\d{1,2}$/.test(v)) {
        unsupported(field, v);
        continue;
      }
      const n = Number(v);
      const current = raw[field];
      raw[field] = current === null ? n : field === 'min_years' ? Math.max(current, n) : Math.min(current, n);
    } else if (field === 'open_to_work' || field === 'current_job_only') {
      if (v !== 'true' && v !== 'false') {
        unsupported(field, v);
        continue;
      }
      const b = v === 'true';
      if (field === 'current_job_only') {
        raw.current_job_only ||= b;
      } else {
        if (raw.open_to_work !== null && raw.open_to_work !== b) unsupported(field, 'true and false');
        raw.open_to_work = b;
      }
    } else {
      raw[field].push(v);
    }
  }
  return RawFilters.parse(raw);
}

const LABELS: Record<ListField, string> = {
  roles: 'role',
  seniorities: 'seniority',
  cities: 'city',
  skills: 'skill',
  skills_any: 'skill',
  companies: 'company',
  company_types: 'company type',
  schools: 'school',
  degrees: 'degree',
  fields: 'field of study',
};

const validYears = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 60);

export function normalizeFilters(raw: RawFilters): Filters {
  const unsupported: { text: string }[] = [];
  const out: Record<string, unknown> = {};

  for (const field of LIST_FIELDS) {
    const values = new Set<string>();
    for (const value of raw[field]) {
      const mapped = toVocab(field, value);
      if (mapped.length === 0) unsupported.push({ text: `${LABELS[field]}: ${value}` });
      for (const m of mapped) values.add(m);
    }
    out[field] = [...values];
  }

  for (const key of ['min_years', 'max_years'] as const) {
    if (validYears(raw[key])) {
      out[key] = raw[key];
    } else {
      out[key] = null;
      unsupported.push({ text: `${key.replace('_', ' ')}: ${raw[key]}` });
    }
  }

  out.open_to_work = raw.open_to_work;
  out.current_job_only = raw.current_job_only;

  for (const u of raw.unsupported) {
    const text = u.text.trim().slice(0, 200);
    if (text) unsupported.push({ text });
  }
  out.unsupported = unsupported.slice(0, 30);

  return Filters.parse(out);
}
