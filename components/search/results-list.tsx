'use client';
// The ranked cards for one page. The first 8 cards stagger in (30 ms apart);
// the rest appear at once. Content is interactive immediately: the animation
// never delays paging.
import { motion, useReducedMotion } from 'motion/react';
import { ShortlistButton } from '@/components/shortlist/shortlist-button';
import { ResultCard, ResultCardSkeleton } from '@/components/search/result-card';
import { ProgressLine } from '@/components/search/progress-line';
import { Skeleton } from '@/components/ui/skeleton';
import type { CandidateCard } from '@/lib/api-types';
import { transition } from '@/lib/motion';
import { personHref } from '@/lib/person-links';

const STAGGER_MAX = 8;
const STAGGER_S = 0.03;

type Props = { results: CandidateCard[]; matchSkills: Set<string>; firstRank: number; searchId: string; page: number };

export function ResultsList({ results, matchSkills, firstRank, searchId, page }: Props) {
  const reduce = useReducedMotion();
  return (
    <ol className="space-y-3" start={firstRank} aria-label="Results">
      {results.map((person, i) => (
        <motion.li
          key={person.id}
          initial={i < STAGGER_MAX ? { opacity: 0, y: reduce ? 0 : 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition, delay: i < STAGGER_MAX ? i * STAGGER_S : 0 }}
        >
          <ResultCard
            person={person}
            matchSkills={matchSkills}
            href={personHref(person.id, { id: searchId, page })}
            actions={<ShortlistButton personId={person.id} personName={person.name} />}
          />
        </motion.li>
      ))}
    </ol>
  );
}

export function ResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <ResultCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** The whole results screen while the first page loads: brief, chips, count, cards. */
export function SearchPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading results">
      <div className="mb-4">
        <ProgressLine />
      </div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-7 w-4/5" />
      <Skeleton className="mt-6 h-3.5 w-24" />
      <div className="mt-3 flex flex-wrap gap-2">
        {[120, 96, 140, 88, 110].map((w) => (
          <Skeleton key={w} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-8 mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <ResultsSkeleton />
    </div>
  );
}
