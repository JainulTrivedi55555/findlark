'use client';
// What the backdrop (components/backdrop.tsx) should look like right now.
// `rich` counts the screens that ask for the full-strength light (empty, error
// and not-found states); `busy` brightens it while a search runs. Pages never
// touch the backdrop itself, they only call these.
import { useEffect, useSyncExternalStore } from 'react';

type State = { rich: number; busy: boolean };

let state: State = { rich: 0, busy: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function useBackdropState(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** While mounted, the backdrop is at full strength (used by StateMessage). */
export function useRichBackdrop() {
  useEffect(() => {
    set({ ...state, rich: state.rich + 1 });
    return () => set({ ...state, rich: state.rich - 1 });
  }, []);
}

/** While `busy` is true the light pools brighten (opacity only). */
export function useBusyBackdrop(busy: boolean) {
  useEffect(() => {
    set({ ...state, busy });
    return () => set({ ...state, busy: false });
  }, [busy]);
}
