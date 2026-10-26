'use client';
// The company's saved searches (GET /api/saved-briefs). Clicking one runs it
// again: a new search from its brief (on the free plan that uses the search,
// which the row's title says), with its saved filters applied on top.
// Delete asks for a confirm in place.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorCard } from '@/components/error-card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiClientError } from '@/lib/api-client';
import type { SavedBrief } from '@/lib/api-types';
import { relativeDate } from '@/lib/format';
import { describeError } from '@/lib/error-copy';
import { fade, fastTransition } from '@/lib/motion';
import { filtersSummary } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';
import { usePlan } from '@/lib/use-plan';

type Load = { status: 'loading' } | { status: 'ready'; items: SavedBrief[] } | { status: 'error'; error: unknown };

type Props = { onOpen: (brief: string, filters: Filters) => void; disabled: boolean };

export function SavedSearches({ onOpen, disabled }: Props) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const plan = usePlan();

  // Bumped by Retry to load again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .savedBriefs()
      .then(({ saved_briefs }) => active && setLoad({ status: 'ready', items: saved_briefs }))
      .catch((error: unknown) => active && setLoad({ status: 'error', error }));
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  const free = plan.status === 'ready' && plan.plan.plan === 'free';
  const left = plan.status === 'ready' ? (plan.plan.searches_remaining ?? 0) : 0;
  const openHint = !free
    ? 'Run this search again'
    : left > 0
      ? 'Run this search again. This uses your company’s free search.'
      : 'Your free search is used. Upgrade to run this again.';

  async function remove(id: string) {
    try {
      await api.deleteSavedBrief(id);
      setLoad((l) => (l.status === 'ready' ? { status: 'ready', items: l.items.filter((s) => s.id !== id) } : l));
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 401)) toast.error('Could not delete. Try again.');
    }
  }

  return (
    <section aria-labelledby="saved-heading" className="mt-14">
      <h2 id="saved-heading" className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        Saved searches
      </h2>

      {load.status === 'loading' && (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading saved searches">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {load.status === 'error' && (
        <ErrorCard
          compact
          className="mt-3"
          copy={{ ...describeError(load.error), title: 'Couldn’t load saved searches' }}
          onRetry={retry}
        />
      )}

      {load.status === 'ready' && load.items.length === 0 && (
        <motion.p {...fade} className="mt-3 text-sm text-muted-foreground">
          No saved searches yet. Use Save search on a results page to keep one here.
        </motion.p>
      )}

      {load.status === 'ready' && load.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {load.items.map((item) => (
              <SavedRow key={item.id} item={item} hint={openHint} disabled={disabled} onOpen={() => onOpen(item.brief, item.filters)} onDelete={() => remove(item.id)} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

type RowProps = { item: SavedBrief; hint: string; disabled: boolean; onOpen: () => void; onDelete: () => Promise<void> };

function SavedRow({ item, hint, disabled, onOpen, onDelete }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <motion.li layout exit={{ opacity: 0 }} transition={fastTransition} className="group flex items-stretch rounded-xl border bg-card transition-colors hover:border-input">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        title={hint}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-l-xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-60"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-medium">{item.brief}</p>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">
            {filtersSummary(item.filters)} · {relativeDate(item.created_at)}
          </p>
        </div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
        <span className="sr-only">. {hint}</span>
      </button>

      <div className="flex items-center pr-2">
        {confirming ? (
          <div className="flex items-center gap-1">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              autoFocus
              onClick={async () => {
                setDeleting(true);
                await onDelete();
                setDeleting(false);
                setConfirming(false);
              }}
              className="max-sm:h-11"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} className="max-sm:h-11">
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Delete saved search: ${item.brief}`} onClick={() => setConfirming(true)} className="text-muted-foreground">
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    </motion.li>
  );
}
