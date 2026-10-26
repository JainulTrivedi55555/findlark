// Filters <-> chips. Pure functions, no I/O, no React: the results page renders
// these chips and calls these helpers to edit the staged filters.
// Tested by scripts/chips-test.ts (npm run test:chips).
//
// One chip per constraint. Multi-value fields (roles, skills, cities...) give
// one chip per value, so removing a value is a single click. Two exceptions:
//   - skills_any is one chip ("Any of: Vue, Svelte"): its values only mean
//     something together (an OR group), so they are edited together.
//   - min_years and max_years together are one "Experience" chip.
import type { Filters, ListField } from './schema';
import { VOCAB } from './schema';

/** Every kind of filter a recruiter can see, add or edit. */
export type ChipKind =
  | 'roles'
  | 'seniorities'
  | 'years'
  | 'cities'
  | 'skills'
  | 'skills_any'
  | 'open_to_work'
  | 'companies'
  | 'company_types'
  | 'current_job_only'
  | 'schools'
  | 'degrees'
  | 'fields';

export type Chip = {
  /** Stable key for React and animations, e.g. "skills:React". */
  id: string;
  kind: ChipKind;
  label: string;
  /** Display value, e.g. "5+ years", "Senior", "a startup". */
  value: string;
  /** The raw vocabulary value for one-value list chips; null otherwise. */
  raw: string | null;
};

/** How each kind is edited: a searchable list, two numbers, or an on/off switch. */
export type EditorType = 'list' | 'multi' | 'years' | 'switch';

type KindInfo = { label: string; editor: EditorType; field?: ListField };

/** Display order and editor for each kind. Also the "+ Add filter" menu order. */
export const KINDS: Record<ChipKind, KindInfo> = {
  roles: { label: 'Role', editor: 'list', field: 'roles' },
  seniorities: { label: 'Seniority', editor: 'list', field: 'seniorities' },
  years: { label: 'Experience', editor: 'years' },
  cities: { label: 'City', editor: 'list', field: 'cities' },
  skills: { label: 'Skill', editor: 'list', field: 'skills' },
  skills_any: { label: 'Any of', editor: 'multi', field: 'skills_any' },
  open_to_work: { label: 'Open to work', editor: 'switch' },
  companies: { label: 'Worked at', editor: 'list', field: 'companies' },
  company_types: { label: 'Worked at', editor: 'list', field: 'company_types' },
  current_job_only: { label: 'Current job only', editor: 'switch' },
  schools: { label: 'School', editor: 'list', field: 'schools' },
  degrees: { label: 'Degree', editor: 'list', field: 'degrees' },
  fields: { label: 'Field of study', editor: 'list', field: 'fields' },
};

export const KIND_ORDER = Object.keys(KINDS) as ChipKind[];

/** Names for the "+ Add filter" menu, where two kinds share the "Worked at" label. */
export const ADD_MENU_LABEL: Record<ChipKind, string> = {
  ...(Object.fromEntries(KIND_ORDER.map((k) => [k, KINDS[k].label])) as Record<ChipKind, string>),
  skills: 'Skill (must have)',
  skills_any: 'Skills (any of)',
  companies: 'Company',
  company_types: 'Company type',
};

/** Vocabulary values for a list kind, for the searchable editor. */
export function optionsFor(kind: ChipKind): string[] {
  switch (kind) {
    case 'roles':
      return VOCAB.roles;
    case 'seniorities':
      return VOCAB.seniorities;
    case 'cities':
      return VOCAB.cities;
    case 'skills':
    case 'skills_any':
      return VOCAB.skills;
    case 'companies':
      return VOCAB.companies.map((c) => c.name);
    case 'company_types':
      return VOCAB.company_types;
    case 'schools':
      return VOCAB.schools;
    case 'degrees':
      return VOCAB.degrees;
    case 'fields':
      return VOCAB.fields;
    default:
      return [];
  }
}

/** How a raw vocabulary value is shown: "senior" -> "Senior", "startup" -> "a startup". */
export function displayValue(kind: ChipKind, raw: string): string {
  if (kind === 'seniorities') return raw.charAt(0).toUpperCase() + raw.slice(1);
  if (kind === 'company_types') return raw === 'enterprise' ? 'an enterprise' : `a ${raw}`;
  return raw;
}

/** "5+ years", "Up to 3 years", "3 to 5 years", "5 years". Empty when neither is set. */
export function yearsLabel(min: number | null, max: number | null): string {
  const unit = (n: number) => (n === 1 ? 'year' : 'years');
  if (min !== null && max !== null) return min === max ? `${min} ${unit(min)}` : `${min} to ${max} years`;
  if (min !== null) return `${min}+ years`;
  if (max !== null) return `Up to ${max} ${unit(max)}`;
  return '';
}

/** Chips for the filters, in display order. `unsupported` is not a chip here. */
export function filtersToChips(f: Filters): Chip[] {
  const chips: Chip[] = [];
  const listChips = (kind: ChipKind & ListField) => {
    for (const raw of f[kind]) {
      chips.push({ id: `${kind}:${raw}`, kind, label: KINDS[kind].label, value: displayValue(kind, raw), raw });
    }
  };

  for (const kind of KIND_ORDER) {
    switch (kind) {
      case 'years':
        if (f.min_years !== null || f.max_years !== null) {
          chips.push({ id: 'years', kind, label: KINDS.years.label, value: yearsLabel(f.min_years, f.max_years), raw: null });
        }
        break;
      case 'skills_any':
        if (f.skills_any.length > 0) {
          chips.push({ id: 'skills_any', kind, label: KINDS.skills_any.label, value: f.skills_any.join(', '), raw: null });
        }
        break;
      case 'open_to_work':
        if (f.open_to_work !== null) {
          chips.push({ id: 'open_to_work', kind, label: KINDS.open_to_work.label, value: f.open_to_work ? 'Yes' : 'No', raw: null });
        }
        break;
      case 'current_job_only':
        // Only meaningful with a company or company type, but shown whenever set
        // so the recruiter can always see and remove it.
        if (f.current_job_only) {
          chips.push({ id: 'current_job_only', kind, label: KINDS.current_job_only.label, value: 'Yes', raw: null });
        }
        break;
      default:
        listChips(kind);
    }
  }
  return chips;
}

/** "Label: Value", or just the label for a yes/no chip that reads on its own. */
export function chipText(chip: Chip): string {
  if (chip.kind === 'current_job_only') return chip.label;
  if (chip.kind === 'open_to_work' && chip.value === 'Yes') return chip.label;
  return `${chip.label}: ${chip.value}`;
}

/** The filters without this chip's constraint. */
export function removeChip(f: Filters, chip: Chip): Filters {
  switch (chip.kind) {
    case 'years':
      return { ...f, min_years: null, max_years: null };
    case 'skills_any':
      return { ...f, skills_any: [] };
    case 'open_to_work':
      return { ...f, open_to_work: null };
    case 'current_job_only':
      return { ...f, current_job_only: false };
    default:
      return { ...f, [chip.kind]: f[chip.kind].filter((v) => v !== chip.raw) };
  }
}

/**
 * Sets a list value. With `previous`, replaces that value in place (editing a
 * chip); without, adds it. Never creates a duplicate.
 */
export function setListValue(f: Filters, field: ListField, value: string, previous: string | null = null): Filters {
  const current = f[field];
  if (previous === null) return current.includes(value) ? f : { ...f, [field]: [...current, value] };
  if (value === previous) return f;
  const next = current.includes(value)
    ? current.filter((v) => v !== previous)
    : current.map((v) => (v === previous ? value : v));
  return { ...f, [field]: next };
}

/** Adds the value if missing, removes it if present (the "any of" editor). */
export function toggleListValue(f: Filters, field: ListField, value: string): Filters {
  const current = f[field];
  return { ...f, [field]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
}

/** Years bounds, kept within the data range and with min <= max (swapped if reversed). */
export function setYears(f: Filters, min: number | null, max: number | null): Filters {
  const clamp = (n: number | null) => (n === null || Number.isNaN(n) ? null : Math.min(60, Math.max(0, Math.round(n))));
  let lo = clamp(min);
  let hi = clamp(max);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  return { ...f, min_years: lo, max_years: hi };
}

export function setOpenToWork(f: Filters, value: boolean | null): Filters {
  return { ...f, open_to_work: value };
}

export function setCurrentJobOnly(f: Filters, value: boolean): Filters {
  return { ...f, current_job_only: value };
}

/** The brief part at this index is dismissed: the search can run without it. */
export function dismissUnsupported(f: Filters, index: number): Filters {
  return { ...f, unsupported: f.unsupported.filter((_, i) => i !== index) };
}

/**
 * Kinds for the "+ Add filter" menu. List kinds hold several values, so they
 * always stay available; one-value kinds disappear once they are set.
 */
export function addableKinds(f: Filters): ChipKind[] {
  return KIND_ORDER.filter((kind) => {
    if (kind === 'years') return f.min_years === null && f.max_years === null;
    if (kind === 'open_to_work') return f.open_to_work === null;
    if (kind === 'current_job_only') return !f.current_job_only;
    if (kind === 'skills_any') return f.skills_any.length === 0;
    const field = KINDS[kind].field;
    return field ? f[field].length < optionsFor(kind).length : true;
  });
}

/** Deep equality for two filter objects (dirty check for the Apply bar). */
export function sameFilters(a: Filters, b: Filters): boolean {
  return JSON.stringify(normalizeOrder(a)) === JSON.stringify(normalizeOrder(b));
}

// Key order can differ between a server response and a local edit.
function normalizeOrder(f: Filters) {
  return Object.fromEntries(Object.entries(f).sort(([x], [y]) => x.localeCompare(y)));
}

// Rough selectivity, most narrowing first. A heuristic from the data's shape
// (28 companies, 13 schools, 79 skills, 10 cities...), not a count: naming
// the exact narrowest filter would need one extra query per filter.
const NARROW_ORDER: ChipKind[] = [
  'companies',
  'schools',
  'fields',
  'skills',
  'years',
  'degrees',
  'cities',
  'skills_any',
  'roles',
  'open_to_work',
  'seniorities',
  'current_job_only',
  'company_types',
];

/** The chip most likely to be emptying the results, for the empty state. */
export function likelyNarrowest(chips: Chip[]): Chip | null {
  for (const kind of NARROW_ORDER) {
    const chip = chips.find((c) => c.kind === kind);
    if (chip) return chip;
  }
  return null;
}

/** Short summary of saved filters, e.g. "Backend Engineer · Austin · Go +1". */
export function filtersSummary(f: Filters, max = 3): string {
  const chips = filtersToChips(f);
  if (chips.length === 0) return 'No filters';
  const shown = chips.slice(0, max).map((c) => (c.kind === 'years' || c.kind === 'open_to_work' || c.kind === 'current_job_only' ? chipText(c) : c.value));
  const more = chips.length - shown.length;
  return more > 0 ? `${shown.join(' · ')} +${more}` : shown.join(' · ');
}

// --- Paging -----------------------------------------------------------------

/** Page buttons with ellipses: 1 … 4 5 6 … 20. Always shows first, last and current ±1. */
export function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    // An ellipsis that would hide one page shows that page instead.
    if (i > 0 && p - prev === 2) items.push(prev + 1);
    else if (i > 0 && p - prev > 2) items.push('gap');
    items.push(p);
  });
  return items;
}

/** "Showing 21 to 40 of 3,394". */
export function showingText(page: number, pageSize: number, total: number): string {
  if (total === 0) return 'No results';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `Showing ${from.toLocaleString('en-US')} to ${to.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}
