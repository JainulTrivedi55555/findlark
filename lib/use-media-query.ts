'use client';
// True while a CSS media query matches. Used to swap popovers for bottom
// sheets on phones (popovers become bottom sheets).
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `sm` breakpoint: 640px and up. */
export const useIsDesktop = () => useMediaQuery('(min-width: 640px)');
