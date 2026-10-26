// Shared animation settings, so every transition in the app feels the same.
// Rules: 150-250 ms, ease-out, animate only opacity and transform.
// Reduced motion: <MotionConfig reducedMotion="user"> in app/providers.tsx turns
// off transform animations app-wide and keeps fades; components that build
// their own movement also check useReducedMotion().
import type { Transition } from 'motion/react';

export const DURATION = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

// A soft ease-out (fast start, gentle stop).
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const transition: Transition = { duration: DURATION.base, ease: EASE_OUT };
export const fastTransition: Transition = { duration: DURATION.fast, ease: EASE_OUT };

/** Page enter: fade plus an 8px rise. Without movement when reduced. */
export function pageEnter(reduce: boolean | null) {
  return {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition,
  };
}

/** Plain fade, for backdrops and skeleton-to-content swaps. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: fastTransition,
};

/** Centred dialog: fade and a slight scale/rise. */
export function dialogPop(reduce: boolean | null) {
  return {
    initial: { opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 6 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: reduce ? 1 : 0.98, y: 0 },
    transition,
  };
}

export type SheetSide = 'top' | 'right' | 'bottom' | 'left';

/** Sheet: slides in from its edge (bottom sheet on mobile). */
export function sheetSlide(side: SheetSide, reduce: boolean | null) {
  const offset = reduce ? 0 : 24;
  const from = {
    top: { y: -offset },
    bottom: { y: offset },
    left: { x: -offset },
    right: { x: offset },
  }[side];
  return {
    initial: { opacity: 0, ...from },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, ...from },
    transition: { duration: DURATION.slow, ease: EASE_OUT },
  };
}

/** Button press feedback. MotionConfig drops the scale under reduced motion. */
export const press = { scale: 0.97 };
