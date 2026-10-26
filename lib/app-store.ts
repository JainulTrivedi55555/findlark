'use client';
// Two tiny pieces of app-wide UI state, readable from any component and
// writable from plain code (the API client opens the upgrade dialog on a 402):
//   - the company's plan (shown in the plan pill)
//   - whether the upgrade dialog is open
// A plain store with useSyncExternalStore: no library, no provider needed.
import { useSyncExternalStore } from 'react';
import type { Plan } from './api-types';
import { resetShortlistsStore } from './shortlists-store';

type PlanState =
  | { status: 'loading' }
  | { status: 'ready'; plan: Plan }
  | { status: 'error' };

type State = { plan: PlanState; upgradeOpen: boolean };

let state: State = { plan: { status: 'loading' }, upgradeOpen: false };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

export function useAppStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(getState()), () => select(getState()));
}

export const setPlanState = (plan: PlanState) => set({ plan });
/** The plan right now, for plain code (useRunSearch compares it before and after a search). */
export const getPlanState = (): PlanState => state.plan;
export const openUpgrade = () => set({ upgradeOpen: true });
export const closeUpgrade = () => set({ upgradeOpen: false });

/** Called on sign-out so the next user never sees the previous plan. */
export const resetAppStore = () => {
  set({ plan: { status: 'loading' }, upgradeOpen: false });
  resetShortlistsStore();
};
