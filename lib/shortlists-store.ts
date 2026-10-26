'use client';
// One client-side copy of the company's shortlists (GET /api/shortlists), so
// every shortlist button on screen shows the same state at once. Same style as
// lib/app-store.ts: a plain store with useSyncExternalStore. Loading and the
// API calls live in lib/use-shortlists.ts; this file only holds state.
import { useSyncExternalStore } from 'react';
import type { ShortlistSummary } from './api-types';

export type ShortlistsState =
  | { status: 'idle'; lists: ShortlistSummary[] }
  | { status: 'loading'; lists: ShortlistSummary[] }
  | { status: 'ready'; lists: ShortlistSummary[] }
  | { status: 'error'; lists: ShortlistSummary[]; error: unknown };

const IDLE: ShortlistsState = { status: 'idle', lists: [] };
let state: ShortlistsState = IDLE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getShortlistsState = () => state;

// Bumped on sign-out, so a request that started for the previous user cannot
// fill the store after it was reset.
let epoch = 0;
export const getEpoch = () => epoch;

export function setShortlistsState(next: ShortlistsState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Changes only the lists, keeping the status. */
export function updateLists(fn: (lists: ShortlistSummary[]) => ShortlistSummary[]) {
  setShortlistsState({ ...state, lists: fn(state.lists) });
}

export function useShortlistsStore(): ShortlistsState {
  return useSyncExternalStore(subscribe, getShortlistsState, () => IDLE);
}

/** Called on sign-out so the next user never sees the previous company's lists. */
export const resetShortlistsStore = () => {
  epoch += 1;
  setShortlistsState(IDLE);
};
