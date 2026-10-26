// Pure helpers for the shortlists cache (lib/shortlists-store.ts). No I/O, no React.
// Every change is per list and per person, so undoing one change (a rollback)
// never touches anything else that happened in the meantime.
import type { ShortlistSummary } from './api-types';

export const NAME_MAX = 80;

/** Adds or removes one person on one list, keeping people_count in step. Same list back if nothing changes. */
export function setMembership(
  lists: ShortlistSummary[],
  listId: string,
  personId: string,
  on: boolean,
): ShortlistSummary[] {
  return lists.map((list) => {
    if (list.id !== listId || list.person_ids.includes(personId) === on) return list;
    const person_ids = on ? [...list.person_ids, personId] : list.person_ids.filter((id) => id !== personId);
    return { ...list, person_ids, people_count: person_ids.length };
  });
}

/** The lists a person is on. */
export function listsForPerson(lists: ShortlistSummary[], personId: string): ShortlistSummary[] {
  return lists.filter((l) => l.person_ids.includes(personId));
}

/** Newest first, like GET /api/shortlists. */
export function addList(lists: ShortlistSummary[], list: ShortlistSummary): ShortlistSummary[] {
  return lists.some((l) => l.id === list.id) ? lists : [list, ...lists];
}

export function renameList(lists: ShortlistSummary[], listId: string, name: string): ShortlistSummary[] {
  return lists.map((l) => (l.id === listId ? { ...l, name } : l));
}

export function removeList(lists: ShortlistSummary[], listId: string): ShortlistSummary[] {
  return lists.filter((l) => l.id !== listId);
}

/**
 * Optimistic change: the new state to show now, and a function that undoes just
 * this change on whatever the state is by then.
 */
export function optimisticMembership(lists: ShortlistSummary[], listId: string, personId: string, on: boolean) {
  return {
    next: setMembership(lists, listId, personId, on),
    rollback: (current: ShortlistSummary[]) => setMembership(current, listId, personId, !on),
  };
}

/** Trimmed name, or the message to show when it cannot be used (the API enforces the same rule). */
export function validateName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: 'Give the list a name.' };
  if (name.length > NAME_MAX) return { ok: false, message: `Keep the name to ${NAME_MAX} characters or fewer.` };
  return { ok: true, name };
}
