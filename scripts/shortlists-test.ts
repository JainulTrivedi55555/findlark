// Tests for lib/shortlists-logic.ts and lib/person-links.ts (npm run test:shortlists).
// Pure functions, no server.
import assert from 'node:assert/strict';
import type { ShortlistSummary } from '../lib/api-types';
import { personHref, safeBackPath, safeSearchId } from '../lib/person-links';
import {
  addList,
  listsForPerson,
  optimisticMembership,
  removeList,
  renameList,
  setMembership,
  validateName,
} from '../lib/shortlists-logic';

const list = (id: string, ...people: string[]): ShortlistSummary => ({
  id, name: `List ${id}`, created_at: '2026-10-01T00:00:00Z', people_count: people.length, person_ids: people,
});
const lists = [list('a', 'p1'), list('b')];

// Toggling membership
const added = setMembership(lists, 'b', 'p1', true);
assert.deepEqual(added[1].person_ids, ['p1']);
assert.equal(added[1].people_count, 1);
assert.equal(added[0], lists[0], 'other lists are the same objects');
assert.deepEqual(setMembership(lists, 'a', 'p1', true), lists, 'adding twice changes nothing');
const removed = setMembership(lists, 'a', 'p1', false);
assert.deepEqual(removed[0].person_ids, []);
assert.equal(removed[0].people_count, 0);
assert.deepEqual(setMembership(lists, 'a', 'p9', false), lists, 'removing someone not there changes nothing');
assert.deepEqual(setMembership(lists, 'nope', 'p1', true), lists, 'unknown list changes nothing');
assert.deepEqual(lists[0].person_ids, ['p1'], 'input is never mutated');

// Optimistic apply and rollback
const { next, rollback } = optimisticMembership(lists, 'b', 'p1', true);
assert.deepEqual(listsForPerson(next, 'p1').map((l) => l.id), ['a', 'b']);
assert.deepEqual(rollback(next), lists, 'rollback restores the previous state');
// Rollback undoes only its own change when something else happened meanwhile.
const meanwhile = setMembership(next, 'a', 'p2', true);
const rolled = rollback(meanwhile);
assert.deepEqual(rolled[0].person_ids, ['p1', 'p2']);
assert.deepEqual(rolled[1].person_ids, []);
// A failed remove is put back.
const failedRemove = optimisticMembership(lists, 'a', 'p1', false);
assert.deepEqual(failedRemove.rollback(failedRemove.next), lists);

// Creating, renaming, deleting
const created = addList(lists, list('c'));
assert.deepEqual(created.map((l) => l.id), ['c', 'a', 'b'], 'new list goes first');
assert.equal(addList(created, list('c')), created, 'same id is not added twice');
assert.equal(renameList(lists, 'a', 'Hiring')[0].name, 'Hiring');
assert.deepEqual(removeList(lists, 'a').map((l) => l.id), ['b']);

// Names: trimmed, 1 to 80 characters
assert.deepEqual(validateName('  Hiring Q4  '), { ok: true, name: 'Hiring Q4' });
assert.equal(validateName('   ').ok, false);
assert.equal(validateName('').ok, false);
assert.equal(validateName('x'.repeat(80)).ok, true);
assert.equal(validateName('x'.repeat(81)).ok, false);
assert.equal(validateName(` ${'x'.repeat(80)} `).ok, true, 'length is counted after trimming');

// Candidate page links
const id = '3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b';
assert.equal(personHref('cand_0001'), '/people/cand_0001');
assert.equal(personHref('cand_0001', { id, page: 1 }), `/people/cand_0001?search=${id}&from=${encodeURIComponent(`/search/${id}`)}`);
assert.equal(
  decodeURIComponent(personHref('cand_0001', { id, page: 3 }).split('from=')[1]),
  `/search/${id}?page=3`,
);
assert.equal(safeBackPath(`/search/${id}`), `/search/${id}`);
assert.equal(safeBackPath(`/search/${id}?page=3`), `/search/${id}?page=3`);
for (const bad of [null, '', '/', '//evil.com', 'https://evil.com', '/search/', '/search/x', `/search/${id}?page=x`,
  `/search/${id}/../..`, `/search/${id}?page=2&x=1`, `/shortlists`, `javascript:alert(1)`, `/search//evil.com`]) {
  assert.equal(safeBackPath(bad), null, `rejects ${bad}`);
}
assert.equal(safeSearchId(id), id);
assert.equal(safeSearchId('nope'), null);
assert.equal(safeSearchId(null), null);

console.log('shortlists-logic and person-links: all checks passed');
