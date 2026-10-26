'use client';
// The brief as the page title, with the words that produced a filter chip
// softly highlighted (lib/search/brief-terms.ts). Hovering or focusing a chip
// emphasises its words. The text is identical to the brief, only wrapped.
import { briefParts } from '@/lib/search/brief-terms';
import type { Chip } from '@/lib/search/chips';
import { cn } from '@/lib/utils';

type Props = { brief: string; chips: Chip[]; activeChip: string | null };

export function BriefText({ brief, chips, activeChip }: Props) {
  return (
    <>
      {briefParts(brief, chips).map((part, i) =>
        part.chipIds.length === 0 ? (
          part.text
        ) : (
          <mark
            key={i}
            className={cn(
              'rounded-[0.3em] px-[0.12em] -mx-[0.12em] text-inherit',
              activeChip && part.chipIds.includes(activeChip) ? 'bg-highlight shadow-[0_0_0_1px_var(--input)]' : 'bg-highlight/45',
            )}
          >
            {part.text}
          </mark>
        ),
      )}
    </>
  );
}
