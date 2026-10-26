// Tests for lib/search/chips.ts (npm run test:chips). Pure functions, no server.
import assert from 'node:assert/strict';
import {
  addableKinds,
  chipText,
  dismissUnsupported,
  filtersSummary,
  filtersToChips,
  likelyNarrowest,
  pageItems,
  removeChip,
  sameFilters,
  setCurrentJobOnly,
  setListValue,
  setOpenToWork,
  setYears,
  showingText,
  toggleListValue,
  yearsLabel,
} from '../lib/search/chips';
import { Filters } from '../lib/search/schema';

const empty = Filters.parse({});
const full = Filters.parse({
  roles: ['Backend Engineer', 'Data Engineer'],
  seniorities: ['senior'],
  min_years: 5,
  max_years: null,
  cities: ['Austin'],
  skills: ['Go', 'Kubernetes'],
  skills_any: ['Vue', 'Svelte'],
  open_to_work: true,
  companies: ['Fablestack'],
  company_types: ['startup'],
  current_job_only: true,
  schools: ['MIT'],
  degrees: ['MS'],
  fields: ['Computer Science'],
  unsupported: [{ text: 'speaks Japanese' }],
});

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

const texts = (f: Filters) => filtersToChips(f).map(chipText);

test('no filters -> no chips', () => assert.deepEqual(filtersToChips(empty), []));

test('every field becomes a chip, in display order', () => {
  assert.deepEqual(texts(full), [
    'Role: Backend Engineer',
    'Role: Data Engineer',
    'Seniority: Senior',
    'Experience: 5+ years',
    'City: Austin',
    'Skill: Go',
    'Skill: Kubernetes',
    'Any of: Vue, Svelte',
    'Open to work',
    'Worked at: Fablestack',
    'Worked at: a startup',
    'Current job only',
    'School: MIT',
    'Degree: MS',
    'Field of study: Computer Science',
  ]);
});

test('chip ids are unique', () => {
  const ids = filtersToChips(full).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('open_to_work false reads "Open to work: No"', () =>
  assert.deepEqual(texts(setOpenToWork(empty, false)), ['Open to work: No']));

test('enterprise reads "an enterprise"', () =>
  assert.deepEqual(texts({ ...empty, company_types: ['enterprise'] }), ['Worked at: an enterprise']));

test('year ranges', () => {
  assert.equal(yearsLabel(5, null), '5+ years');
  assert.equal(yearsLabel(3, 5), '3 to 5 years');
  assert.equal(yearsLabel(null, 3), 'Up to 3 years');
  assert.equal(yearsLabel(null, 1), 'Up to 1 year');
  assert.equal(yearsLabel(4, 4), '4 years');
  assert.equal(yearsLabel(null, null), '');
  assert.deepEqual(texts(setYears(empty, 3, 5)), ['Experience: 3 to 5 years']);
});

test('setYears clamps, rounds and swaps reversed bounds', () => {
  const f = setYears(empty, 8, 2);
  assert.equal(f.min_years, 2);
  assert.equal(f.max_years, 8);
  const g = setYears(empty, -3, 99.6);
  assert.equal(g.min_years, 0);
  assert.equal(g.max_years, 60);
  assert.equal(setYears(empty, Number.NaN, null).min_years, null);
});

test('removing each chip removes exactly its constraint', () => {
  for (const chip of filtersToChips(full)) {
    const next = removeChip(full, chip);
    const before = texts(full).filter((t) => t !== chipText(chip));
    assert.deepEqual(texts(next), before, `removing ${chipText(chip)}`);
    assert.deepEqual(next.unsupported, full.unsupported, 'unsupported untouched');
  }
});

test('removing years clears both bounds', () => {
  const f = removeChip(setYears(empty, 3, 5), filtersToChips(setYears(empty, 3, 5))[0]);
  assert.equal(f.min_years, null);
  assert.equal(f.max_years, null);
});

test('removing every chip leaves no constraint', () => {
  let f = full;
  for (const chip of filtersToChips(full)) f = removeChip(f, chip);
  assert.deepEqual(filtersToChips(f), []);
});

test('removeChip does not mutate its input', () => {
  const copy = JSON.stringify(full);
  removeChip(full, filtersToChips(full)[0]);
  assert.equal(JSON.stringify(full), copy);
});

test('setListValue adds, replaces in place, and never duplicates', () => {
  assert.deepEqual(setListValue(empty, 'skills', 'Go').skills, ['Go']);
  const f = { ...empty, skills: ['Go', 'Rust'] };
  assert.deepEqual(setListValue(f, 'skills', 'Python', 'Go').skills, ['Python', 'Rust']);
  assert.deepEqual(setListValue(f, 'skills', 'Rust', 'Go').skills, ['Rust'], 'replace with existing merges');
  assert.equal(setListValue(f, 'skills', 'Go'), f, 'adding an existing value is a no-op');
});

test('toggleListValue adds then removes', () => {
  const once = toggleListValue(empty, 'skills_any', 'Vue');
  assert.deepEqual(once.skills_any, ['Vue']);
  assert.deepEqual(toggleListValue(once, 'skills_any', 'Vue').skills_any, []);
});

test('switches', () => {
  assert.equal(setCurrentJobOnly(empty, true).current_job_only, true);
  assert.equal(setOpenToWork(full, null).open_to_work, null);
});

test('dismissUnsupported removes one item by index', () => {
  const f = { ...empty, unsupported: [{ text: 'a' }, { text: 'b' }] };
  assert.deepEqual(dismissUnsupported(f, 0).unsupported, [{ text: 'b' }]);
});

test('addableKinds hides one-value kinds once set, keeps list kinds', () => {
  const all = addableKinds(empty);
  assert.equal(all.length, 13);
  const used = addableKinds(full);
  for (const k of ['years', 'open_to_work', 'current_job_only', 'skills_any'] as const) assert.ok(!used.includes(k), k);
  for (const k of ['roles', 'skills', 'cities', 'schools'] as const) assert.ok(used.includes(k), k);
  const allSeniorities = { ...empty, seniorities: ['junior', 'mid', 'senior', 'staff'] };
  assert.ok(!addableKinds(allSeniorities).includes('seniorities'), 'full list kind disappears');
});

test('sameFilters ignores key order', () => {
  const reordered = Filters.parse(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(full).reverse()))));
  assert.ok(sameFilters(full, reordered));
  assert.ok(!sameFilters(full, setOpenToWork(full, false)));
});

test('likelyNarrowest prefers company, then school', () => {
  assert.equal(likelyNarrowest(filtersToChips(full))?.id, 'companies:Fablestack');
  assert.equal(likelyNarrowest(filtersToChips({ ...empty, cities: ['Austin'], schools: ['MIT'] }))?.id, 'schools:MIT');
  assert.equal(likelyNarrowest([]), null);
});

test('filtersSummary', () => {
  assert.equal(filtersSummary(empty), 'No filters');
  assert.equal(filtersSummary({ ...empty, roles: ['Backend Engineer'], cities: ['Austin'] }), 'Backend Engineer · Austin');
  assert.equal(filtersSummary(full), 'Backend Engineer · Data Engineer · Senior +12');
});

test('pageItems', () => {
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageItems(1, 20), [1, 2, 3, 4, 'gap', 20]);
  assert.deepEqual(pageItems(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20]);
  assert.deepEqual(pageItems(20, 20), [1, 'gap', 17, 18, 19, 20]);
  assert.deepEqual(pageItems(4, 20), [1, 2, 3, 4, 5, 'gap', 20]);
});

test('showingText', () => {
  assert.equal(showingText(2, 20, 3394), 'Showing 21 to 40 of 3,394');
  assert.equal(showingText(2, 20, 21), 'Showing 21 to 21 of 21');
  assert.equal(showingText(1, 20, 0), 'No results');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
