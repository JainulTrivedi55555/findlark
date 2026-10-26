'use client';
// The company's last 10 searches (GET /api/searches). Opening one goes straight
// to its stored results: no model call, no quota. This matters on the free plan,
// where the one search can end in zero results and would otherwise be unreachable.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { ErrorCard } from '@/components/error-card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api-client';
import type { RecentSearch } from '@/lib/api-types';
import { peopleCount, relativeDate } from '@/lib/format';
import { describeError } from '@/lib/error-copy';
import { fade } from '@/lib/motion';

type Load = { status: 'loading' } | { status: 'ready'; items: RecentSearch[] } | { status: 'error'; error: unknown };

export function RecentSearches() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // Bumped by Retry to load again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .recentSearches()
      .then(({ searches }) => active && setLoad({ status: 'ready', items: searches }))
      .catch((error: unknown) => active && setLoad({ status: 'error', error }));
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <section aria-labelledby="recent-heading" className="mt-14">
      <h2 id="recent-heading" className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        Recent searches
      </h2>

      {load.status === 'loading' && (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading recent searches">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
          ))}
        </div>
      )}

      {load.status === 'error' && (
        <ErrorCard
          compact
          className="mt-3"
          copy={{ ...describeError(load.error), title: 'Couldn’t load recent searches' }}
          onRetry={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      )}

      {load.status === 'ready' && load.items.length === 0 && (
        <motion.p {...fade} className="mt-3 text-sm text-muted-foreground">
          No searches yet. Your latest ones will show up here.
        </motion.p>
      )}

      {load.status === 'ready' && load.items.length > 0 && (
        <motion.ul {...fade} className="mt-3 space-y-2">
          {load.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/search/${item.id}`}
                title="Open these results again. Free: this does not run a new search."
                className="group flex items-start gap-3 rounded-xl border bg-card p-4 outline-none transition-colors hover:border-input focus-visible:ring-3 focus-visible:ring-ring/25"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] font-medium">{item.brief}</p>
                  <p className="mt-1 text-[13px]">
                    {item.total === 0 ? (
                      <span className="text-muted-foreground">No results</span>
                    ) : (
                      <span className="font-medium text-foreground">{peopleCount(item.total)}</span>
                    )}
                    <span className="text-muted-foreground"> · {relativeDate(item.created_at)}</span>
                  </p>
                </div>
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
                <span className="sr-only">. Free: opens the stored results, no new search.</span>
              </Link>
            </li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
