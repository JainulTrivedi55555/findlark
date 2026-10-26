'use client';
// Loading and changing the shortlists cache (lib/shortlists-store.ts).
// Memberships change optimistically: the UI updates first, the API call
// follows, and a failure undoes just that one change and throws, so the caller
// can show a toast. Components never call the shortlist API directly for state
// the buttons share.
import { useEffect } from 'react';
import { api } from './api-client';
import type { ShortlistSummary } from './api-types';
import { addList, optimisticMembership, removeList, renameList } from './shortlists-logic';
import {
  getEpoch,
  getShortlistsState,
  setShortlistsState,
  updateLists,
  useShortlistsStore,
} from './shortlists-store';

let inFlight: Promise<void> | null = null;

/** Reads GET /api/shortlists into the store. Concurrent calls share one request. */
export function loadShortlists(): Promise<void> {
  if (inFlight) return inFlight;
  const epoch = getEpoch();
  const { lists } = getShortlistsState();
  // Keep what we have while reloading, so buttons do not flicker.
  setShortlistsState({ status: 'loading', lists });
  inFlight = api
    .shortlists()
    .then(({ shortlists }) => {
      if (epoch === getEpoch()) setShortlistsState({ status: 'ready', lists: shortlists });
    })
    .catch((error: unknown) => {
      if (epoch === getEpoch()) setShortlistsState({ status: 'error', lists: getShortlistsState().lists, error });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The lists, loaded once the first time any component asks (and again after an error). */
export function useShortlists() {
  const store = useShortlistsStore();
  useEffect(() => {
    if (store.status === 'idle' || store.status === 'error') void loadShortlists();
  }, [store.status]);
  return { ...store, retry: loadShortlists };
}

/** Add (on) or remove (off) one person on one list. Throws after undoing the change if the API fails. */
export async function setOnList(listId: string, personId: string, on: boolean): Promise<void> {
  const { next, rollback } = optimisticMembership(getShortlistsState().lists, listId, personId, on);
  updateLists(() => next);
  try {
    if (on) await api.addToShortlist(listId, personId);
    else await api.removeFromShortlist(listId, personId);
  } catch (err) {
    updateLists(rollback);
    throw err;
  }
}

/** Creates a list (needs the server's id, so not optimistic) and puts it first. */
export async function createList(name: string): Promise<ShortlistSummary> {
  const { id } = await api.createShortlist(name);
  const list: ShortlistSummary = { id, name, created_at: new Date().toISOString(), people_count: 0, person_ids: [] };
  updateLists((lists) => addList(lists, list));
  return list;
}

export async function rename(listId: string, name: string): Promise<void> {
  const res = await api.renameShortlist(listId, name);
  updateLists((lists) => renameList(lists, listId, res.name));
}

export async function deleteList(listId: string): Promise<void> {
  await api.deleteShortlist(listId);
  updateLists((lists) => removeList(lists, listId));
}
