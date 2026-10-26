'use client';
// A small count badge for the Shortlists nav item: how many distinct people are
// on any list. It reads the shared shortlists store (the same one the bookmark
// buttons use), so it changes the moment someone is shortlisted, and bumps
// (scale 1 > 1.2 > 1) so the recruiter sees where their click went.
// Hidden at 0. The number is decoration; a polite live region says it in words
// and stays outside the link, so the link's name is still just "Shortlists".
import { useEffect, useRef } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '@/lib/motion';
import { useShortlists } from '@/lib/use-shortlists';

export function useShortlistedCount(): number {
  const { lists } = useShortlists();
  return new Set(lists.flatMap((l) => l.person_ids)).size;
}

export function ShortlistCountBadge({ count }: { count: number }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current && !reduce && scope.current) {
      void animate(scope.current, { scale: [1, 1.2, 1] }, { duration: 0.22, ease: EASE_OUT });
    }
    previous.current = count;
  }, [count, reduce, animate, scope]);

  if (count === 0) return null;
  return (
    <span
      ref={scope}
      aria-hidden
      className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-highlight px-1 text-[11px] leading-none font-semibold text-highlight-foreground tabular-nums"
    >
      {count}
    </span>
  );
}

/** Screen-reader text for the badge; render it next to the link, not inside it. */
export function ShortlistCountAnnouncement({ count }: { count: number }) {
  return (
    <span className="sr-only" aria-live="polite">
      {count === 0 ? '' : `${count} ${count === 1 ? 'person' : 'people'} shortlisted`}
    </span>
  );
}
